#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NET_Detail – Net Damage reconciliation.

Rules (per user spec):
 1. Primary key  : ref_id equal  -> same slip, count amount once.
    (same ref_id but DIFFERENT amount -> conflict -> Needs Review, never auto-merged)
 2. Fallback key : slips whose ref_id is unreadable: (date+time+amount+sender+recipient)
    equal to a counted slip -> "suspected_duplicate" (excluded from net, listed for human).
 3. Human-in-the-loop: incomplete data / confidence < 0.85 / validation flags
    -> "needs_review". AI NEVER drops these; they are listed separately and are NOT in the net.

Input : list of CanonicalEvidenceRecord (extracted_data.*) or legacy example schema (transaction.*)
Output: flat list with ref_id, amount, date, time, page, physical_page, status ...
"""
import json
import re
from decimal import Decimal, InvalidOperation

CONFIDENCE_THRESHOLD = 0.85

ST_COUNTED = "counted"
ST_DUP = "duplicate"
ST_SUSPECT = "suspected_duplicate"
ST_REVIEW = "needs_review"


def _norm_text(s):
    return re.sub(r"\s+", " ", str(s)).strip().lower() if s else ""


def _norm_ref(s):
    s = re.sub(r"\s+", "", str(s)) if s else ""
    return s.upper() or None


def _norm_time(s):
    if not s:
        return None
    m = re.match(r"^\s*(\d{1,2}):(\d{2})", str(s))
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def _to_amount(v):
    if v is None:
        return None
    try:
        d = Decimal(str(v).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return None
    return d if d > 0 else None


def normalize_record(rec, idx):
    """Canonical (or legacy) record -> flat dict (amount kept as Decimal)."""
    reasons = []
    if "extracted_data" in rec:  # Canonical schema
        ed = rec["extracted_data"]
        meta = rec.get("metadata", {})
        conf = rec.get("confidence", {})
        val = rec.get("validation", {})
        amount = _to_amount(ed.get("amount_number")) or _to_amount(ed.get("amount"))
        ref = _norm_ref(ed.get("ref_id"))
        date = ed.get("transaction_date")
        time = _norm_time(ed.get("transaction_time"))
        sender = (ed.get("sender") or {}).get("name")
        recipient = (ed.get("recipient") or {}).get("name")
        confs = [conf.get(k) for k in ("overall", "amount", "datetime")]
        if ref:
            confs.append(conf.get("ref_id"))
        page = (meta.get("source") or {}).get("page_number")
        rid = meta.get("id") or f"rec_{idx}"
        if val.get("overall_status") in ("needs_review", "unreadable"):
            reasons.append(f"validation={val.get('overall_status')}")
        if val.get("calculation_eligible") is False:
            reasons.append("calculation_eligible=false")
    else:  # legacy example schema
        tx = rec.get("transaction", {})
        conf = rec.get("confidence", {})
        amount = _to_amount(tx.get("amount"))
        ref = _norm_ref(tx.get("reference_no"))
        date, time = tx.get("date"), _norm_time(tx.get("time"))
        sender = (rec.get("sender") or {}).get("name")
        recipient = (rec.get("receiver") or {}).get("name")
        confs = [conf.get("amount"), conf.get("date"), conf.get("time")]
        if ref:
            confs.append(conf.get("reference_no"))
        page = rec.get("page") or rec.get("page_number")
        rid = rec.get("id") or f"rec_{idx}"
        if rec.get("warnings"):
            reasons.append("warnings=" + ";".join(map(str, rec["warnings"])))

    confs = [c for c in confs if c is not None]
    cmin = min(confs) if confs else None
    if cmin is None:
        reasons.append("no confidence values")
    elif cmin < CONFIDENCE_THRESHOLD:
        reasons.append(f"confidence {cmin:.2f} < {CONFIDENCE_THRESHOLD}")
    if amount is None:
        reasons.append("amount missing/invalid")
    if not date:
        reasons.append("date missing")
    if not time:
        reasons.append("time missing")
    try:
        page = int(page) if page is not None else None
    except (TypeError, ValueError):
        page = None
    if page is None:
        reasons.append("page missing")

    return {
        "record_id": rid, "ref_id": ref, "amount": amount, "date": date, "time": time,
        "sender_name": sender, "recipient_name": recipient, "confidence_min": cmin,
        "page": page, "physical_page": None, "status": None, "reasons": reasons,
        "duplicate_of": None,
    }


def _fallback_key(r):
    return (r["date"], r["time"], r["amount"], _norm_text(r["sender_name"]), _norm_text(r["recipient_name"]))


def reconcile(records, page_offset=0):
    """Returns (flat_list, summary). Order of input preserved; first valid occurrence is counted."""
    flat = [normalize_record(r, i) for i, r in enumerate(records)]
    for r in flat:
        if r["page"] is not None:
            r["physical_page"] = r["page"] + page_offset

    # 1. Needs Review gate (never auto-dropped)
    for r in flat:
        # missing ref_id alone is not a review reason (handled by fallback rule) -> remove 'page missing' only if...
        blocking = [x for x in r["reasons"] if x != "page missing"]
        if blocking:
            r["status"] = ST_REVIEW

    # 2. Primary key: ref_id (only among slips not already in review)
    by_ref = {}
    for r in flat:
        if r["status"] or not r["ref_id"]:
            continue
        by_ref.setdefault(r["ref_id"], []).append(r)
    for ref, grp in by_ref.items():
        amounts = {g["amount"] for g in grp}
        if len(amounts) > 1:  # same ref, different amounts -> human decides
            for g in grp:
                g["status"] = ST_REVIEW
                g["reasons"].append(f"ref_id conflict: same ref, amounts {sorted(str(a) for a in amounts)}")
            continue
        grp[0]["status"] = ST_COUNTED
        for g in grp[1:]:
            g["status"] = ST_DUP
            g["duplicate_of"] = grp[0]["record_id"]

    # 3. Fallback: slips without ref_id
    counted_keys = {}
    for r in flat:
        if r["status"] == ST_COUNTED:
            counted_keys.setdefault(_fallback_key(r), r)
    for r in flat:
        if r["status"] or r["ref_id"]:
            continue
        match = counted_keys.get(_fallback_key(r))
        if match is not None:
            r["status"] = ST_SUSPECT
            r["duplicate_of"] = match["record_id"]
            r["reasons"].append("ref_id unreadable; date+time+amount+names match a counted slip")
        else:
            r["status"] = ST_REVIEW
            r["reasons"].append("ref_id unreadable; no match -> human review")

    zero = Decimal("0")
    gross = sum((r["amount"] or zero for r in flat), zero)
    counted = [r for r in flat if r["status"] == ST_COUNTED]
    dups = [r for r in flat if r["status"] == ST_DUP]
    suspects = [r for r in flat if r["status"] == ST_SUSPECT]
    review = [r for r in flat if r["status"] == ST_REVIEW]
    s = lambda lst: sum((r["amount"] or zero for r in lst), zero)
    summary = {
        "total_records": len(flat),
        "gross_amount": gross,
        "counted_n": len(counted), "net_amount": s(counted),
        "duplicate_n": len(dups), "duplicate_amount": s(dups),
        "suspected_n": len(suspects), "suspected_amount": s(suspects),
        "needs_review_n": len(review), "needs_review_amount": s(review),
        "page_offset": page_offset,
    }
    # Invariant: every record lands in exactly one bucket; nothing silently lost
    assert len(counted) + len(dups) + len(suspects) + len(review) == len(flat)
    assert summary["net_amount"] + summary["duplicate_amount"] + summary["suspected_amount"] + summary["needs_review_amount"] == gross
    return flat, summary


def to_json_list(flat):
    """Serializable slip_index.json content (flat; includes amount/ref_id/date/time/physical_page)."""
    out = []
    for r in flat:
        d = dict(r)
        d["amount"] = float(r["amount"]) if r["amount"] is not None else None
        out.append(d)
    return out


# --------------------------------------------------------------------------- PDF report
_STATUS_TH = {
    ST_COUNTED: "นับยอด",
    ST_DUP: "ซ้ำ (ไม่นับ)",
    ST_SUSPECT: "สงสัยซ้ำ (รอตรวจ)",
    ST_REVIEW: "รอตรวจสอบ",
}


def _fmt(d):
    return f"{d:,.2f}" if d is not None else "-"


def build_net_report_pdf(flat, summary, out_pdf, font_dir):
    """A4 PDF 'ตารางสรุปความเสียหายสุทธิ' via fitz.Story (Sarabun, Thai shaping). Returns page count."""
    import fitz
    from html import escape

    def rows(items):
        out = []
        for i, r in enumerate(items, 1):
            pg = r["physical_page"] if r["physical_page"] is not None else "-"
            note = escape("; ".join(r["reasons"])) if r["reasons"] else ""
            if r["duplicate_of"]:
                note = f"ซ้ำกับ {escape(str(r['duplicate_of']))} " + note
            out.append(
                f"<tr><td>{i}</td><td>{escape(str(r['ref_id'] or '-'))}</td>"
                f"<td class='n'>{_fmt(r['amount'])}</td>"
                f"<td>{escape(str(r['date'] or '-'))} {escape(str(r['time'] or ''))}</td>"
                f"<td class='n'>{pg}</td><td>{_STATUS_TH[r['status']]}</td><td>{note}</td></tr>"
            )
        return "".join(out)

    head = ("<tr><th>#</th><th>ref_id</th><th>ยอดเงิน (บาท)</th><th>วันที่/เวลา</th>"
            "<th>หน้าใน PDF</th><th>สถานะ</th><th>หมายเหตุ</th></tr>")
    counted = [r for r in flat if r["status"] == ST_COUNTED]
    others = [r for r in flat if r["status"] != ST_COUNTED]

    html = f"""
<h1 class='b'>ตารางสรุปความเสียหายสุทธิ (NET Detail Report)</h1>
<table class='s'>
<tr><td>ยอดรวมทุกใบที่ตรวจพบ (Gross) {summary['total_records']} ใบ</td><td class='n'>{_fmt(summary['gross_amount'])}</td></tr>
<tr><td>หัก สลิปซ้ำ (ref_id ตรงกัน) {summary['duplicate_n']} ใบ</td><td class='n'>{_fmt(summary['duplicate_amount'])}</td></tr>
<tr><td>แยก สงสัยซ้ำ (รอตรวจ) {summary['suspected_n']} ใบ</td><td class='n'>{_fmt(summary['suspected_amount'])}</td></tr>
<tr><td>แยก รอการตรวจสอบ (Needs Review) {summary['needs_review_n']} ใบ</td><td class='n'>{_fmt(summary['needs_review_amount'])}</td></tr>
<tr class='t'><td><b>ยอดความเสียหายสุทธิที่ยืนยันแล้ว (Net) {summary['counted_n']} ใบ</b></td><td class='n'><b>{_fmt(summary['net_amount'])}</b></td></tr>
</table>
<p class='l'>หมายเหตุ: ยอดสุทธิไม่รวมรายการ &quot;รอการตรวจสอบ&quot; และ &quot;สงสัยซ้ำ&quot; ซึ่งต้องให้เจ้าหน้าที่ตรวจสอบ ระบบไม่ตัดทิ้งอัตโนมัติ
 | เลขหน้า = หน้าจริงในไฟล์ PDF ฉบับนี้ (offset {summary['page_offset']})</p>
<h2 class='b'>รายการที่นับเป็นยอดสุทธิ</h2>
<table class='d'>{head}{rows(counted)}</table>
<h2 class='b'>รายการที่ไม่นับ / รอตรวจสอบ</h2>
<table class='d'>{head}{rows(others) if others else "<tr><td colspan='7'>ไม่มี</td></tr>"}</table>
"""
    css = f"""
@font-face {{ font-family: SarabunB; src: url(Sarabun-Bold.ttf); }}
@font-face {{ font-family: SarabunL; src: url(Sarabun-Light.ttf); }}
body {{ font-family: SarabunL; font-size: 9pt; }}
.b, th {{ font-family: SarabunB; }}
h1 {{ font-size: 16pt; text-align: center; }}
h2 {{ font-size: 12pt; margin-top: 10pt; }}
table {{ width: 100%; border-collapse: collapse; }}
td, th {{ border: 0.5pt solid #444; padding: 2pt 3pt; }}
th {{ background-color: #dde3ea; }}
.n {{ text-align: right; }}
.t td {{ background-color: #fff3c4; }}
.l {{ font-size: 8pt; }}
"""
    story = fitz.Story(html=html, user_css=css, archive=fitz.Archive(str(font_dir)))
    writer = fitz.DocumentWriter(str(out_pdf))
    mediabox = fitz.paper_rect("a4")
    where = mediabox + (40, 50, -40, -50)
    n, more = 0, 1
    while more:
        dev = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
        n += 1
    writer.close()
    return n


def load_records(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("slips", data.get("records", [data]))
    return data
