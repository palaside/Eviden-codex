import argparse
import base64
import io
import json
import math
import os
import sys
import tempfile
from datetime import datetime
from html import unescape

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def evidence_page_marker(source_file, page_label):
    payload = json.dumps(
        {"source_file": source_file, "page_label": page_label},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return "APP_EVIDENCE_PAGE:" + base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


class EvidencePageTextMarker(Flowable):
    def __init__(self, source_file, page_label):
        super().__init__()
        self.marker = evidence_page_marker(source_file, page_label)

    def wrap(self, available_width, available_height):
        return 0, 0

    def draw(self):
        text = self.canv.beginText(0, 0)
        text.setFont("Helvetica", 1)
        text.setTextRenderMode(3)
        text.textLine(self.marker)
        self.canv.drawText(text)


def register_thai_font():
    candidates = [
        r"C:\Windows\Fonts\tahoma.ttf",
        r"C:\Windows\Fonts\THSarabunNew.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont("EvidenceThai", path))
            return "EvidenceThai"
    return "Helvetica"


def clean_text(value):
    if value is None:
        return "-"
    text = unescape(str(value)).replace("\r", " ").replace("\n", " ").strip()
    return text or "-"


def money(value):
    if value is None or value == "":
        return "-"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    return f"{number:,.2f}" if math.isfinite(number) else "-"


def build_pdf(input_path, temp_pdf_path):
    with open(input_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    font_name = register_thai_font()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ThaiTitle",
        parent=styles["Title"],
        fontName=font_name,
        fontSize=18,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
    ))
    styles.add(ParagraphStyle(
        name="ThaiBody",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#1e293b"),
    ))
    styles.add(ParagraphStyle(
        name="ThaiSmall",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#475569"),
    ))

    doc = SimpleDocTemplate(
        temp_pdf_path,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Digital Evidence Export",
        author="Digital Evidence",
    )

    case_number = clean_text(payload.get("caseNumber"))
    export_password_set = bool(clean_text(payload.get("exportPasswordSet")) == "True")
    evidence = payload.get("evidenceState") or {}
    manifest = payload.get("manifestEntries") or []
    staged_items = payload.get("stagedItems") or []
    slip_records = payload.get("slipRecords") or []
    cover = payload.get("coverData") or {}
    try:
        slip_count = int(evidence.get("slipCount") or 0)
    except (TypeError, ValueError):
        slip_count = 0
    financial_records = slip_records or [
        item for item in staged_items
        if item.get("category") == "SLIP"
        or ((item.get("data") or {}).get("transaction") or {}).get("amount") is not None
    ]
    has_financial_evidence = slip_count > 0 or bool(financial_records)

    story = [
        Paragraph(clean_text(cover.get("dossier_title") or "DIGITAL EVIDENCE - เอกสารส่งออกหลักฐานดิจิทัล"), styles["ThaiTitle"]),
        Spacer(1, 18),
        Paragraph(f"เลขอ้างอิง: {clean_text(cover.get('case_number') or case_number)}", styles["ThaiBody"]),
        Paragraph(f"สถานี/หน่วยงาน: {clean_text(cover.get('police_station'))}", styles["ThaiBody"]),
        Paragraph(f"ผู้จัดทำ: {clean_text(cover.get('investigator_name'))}", styles["ThaiBody"]),
        Paragraph(f"สร้างเมื่อ: {clean_text(cover.get('timestamp') or payload.get('generatedAt'))}", styles["ThaiSmall"]),
        Spacer(1, 40),
        Paragraph("แฟ้มเอกสารประกอบการตรวจสอบหลักฐานดิจิทัล", styles["ThaiBody"]),
        Paragraph("เอกสารนี้รวบรวมข้อมูลสรุปและภาพหลักฐานตามรายการที่นำเข้า", styles["ThaiSmall"]),
        PageBreak(),
        Paragraph("สรุปข้อมูล", styles["ThaiTitle"]),
        Paragraph(f"เลขอ้างอิง: {case_number}", styles["ThaiBody"]),
        Paragraph(f"สร้างเมื่อ: {clean_text(payload.get('generatedAt'))}", styles["ThaiSmall"]),
        Paragraph("สถานะรหัสผ่าน: " + ("ตั้งรหัสสำหรับเปิดเอกสารแล้ว" if export_password_set else "ไม่ได้ตั้งรหัสผ่าน"), styles["ThaiSmall"]),
        Spacer(1, 8),
    ]

    if has_financial_evidence:
        story.append(Paragraph("สรุปตัวเลขหลัก", styles["ThaiBody"]))
        summary_rows = [
            ["รายการ", "ค่า"],
            ["ยอดรวมสุทธิ", money(evidence.get("totalNetLoss"))],
            ["จำนวนสลิป", clean_text(evidence.get("slipCount"))],
            ["จำนวนจุดซ้ำ", clean_text(evidence.get("duplicateCount"))],
            ["บุคคล/เป้าหมายที่เลือก", clean_text(evidence.get("poiName"))],
            ["ยอดเฉพาะบุคคล/เป้าหมาย", money(evidence.get("poiLossSum"))],
        ]
        summary_table = Table(summary_rows, colWidths=[70 * mm, 90 * mm])
        summary_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), font_name),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.extend([summary_table, Spacer(1, 10)])
    else:
        story.append(Paragraph("เอกสารหลักฐานบทสนทนา · ไม่มีตารางสรุปธุรกรรมทางการเงิน", styles["ThaiSmall"]))
        story.append(Spacer(1, 10))

    story.append(Paragraph("รายการไฟล์/พยานหลักฐานที่นำเข้า", styles["ThaiBody"]))
    evidence_rows = [["ลำดับ", "ชื่อไฟล์", "ประเภท", "SHA-256"]]
    evidence_widths = [12 * mm, 58 * mm, 25 * mm, 55 * mm]
    if has_financial_evidence:
        evidence_rows[0].append("ยอดเงิน")
        evidence_widths = [12 * mm, 48 * mm, 22 * mm, 48 * mm, 28 * mm]
    for idx, item in enumerate(staged_items, start=1):
        transaction = (item.get("data") or {}).get("transaction") or {}
        meta = item.get("meta") or {}
        row = [
            str(idx),
            clean_text(item.get("fileName")),
            clean_text(item.get("category")),
            clean_text(meta.get("sha256"))[:24],
        ]
        if has_financial_evidence:
            amount = transaction.get("amount")
            row.append(money(amount) if amount is not None else "-")
        evidence_rows.append(row)
    if len(evidence_rows) == 1:
        evidence_rows.append(["-", "ยังไม่มีรายการ", "-", "-"] + (["-"] if has_financial_evidence else []))

    evidence_table = Table(evidence_rows, colWidths=evidence_widths)
    evidence_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(evidence_table)
    if has_financial_evidence:
        story.extend([PageBreak(), Paragraph("ตารางรายการหลักฐาน", styles["ThaiTitle"]), Spacer(1, 8)])
        ledger_rows = [["ลำดับ", "วัน/เวลา", "ผู้โอน", "ธนาคารผู้โอน", "จำนวนเงิน", "ผู้รับโอน", "ธนาคารผู้รับ", "บันทึก/อ้างอิง"]]
        for idx, item in enumerate(financial_records, start=1):
            data = item.get("data") or {}
            transaction = data.get("transaction") or {}
            sender = data.get("sender") or {}
            receiver = data.get("receiver") or {}
            bank = data.get("bank") or {}
            ledger_rows.append([
                str(idx), clean_text(" ".join(filter(None, [transaction.get("date"), transaction.get("time")]))),
                clean_text(sender.get("name")), clean_text(sender.get("bank")), money(transaction.get("amount")),
                clean_text(receiver.get("name")), clean_text(receiver.get("bank") or bank.get("name")),
                clean_text(transaction.get("note") or transaction.get("reference_no")),
            ])
        ledger_table = Table(ledger_rows, colWidths=[10*mm, 23*mm, 26*mm, 23*mm, 17*mm, 26*mm, 23*mm, 30*mm], repeatRows=1)
        ledger_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), font_name), ("FONTSIZE", (0, 0), (-1, -1), 6.5),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.extend([ledger_table, PageBreak()])
    else:
        story.append(PageBreak())

    has_evidence_page = False
    for item in staged_items:
        item_pages = item.get("pages") or []
        for page_idx, evidence_page in enumerate(item_pages):
            if story and not isinstance(story[-1], PageBreak):
                story.append(PageBreak())
            evidence_page_content = []
            if not has_evidence_page:
                evidence_page_content.append(Paragraph("ภาพหลักฐาน", styles["ThaiTitle"]))
                has_evidence_page = True
            source_file_name = clean_text(item.get("fileName"))
            page_label = clean_text(evidence_page.get("label") or f"หน้า {page_idx + 1}")
            evidence_page_content.extend([
                Paragraph(f"{clean_text(item.get('category'))}: {source_file_name}", styles["ThaiBody"]),
                Paragraph(page_label, styles["ThaiSmall"]),
                EvidencePageTextMarker(source_file_name, page_label),
            ])
            image_data = evidence_page.get("imageData", "")
            if isinstance(image_data, str) and image_data.startswith("data:image/") and "," in image_data:
                try:
                    raw_image = base64.b64decode(image_data.split(",", 1)[1], validate=True)
                    image = Image(io.BytesIO(raw_image), width=178 * mm, height=200 * mm, kind="proportional")
                    evidence_page_content.extend([image, Paragraph("หน้าเอกสารหลักฐานที่นำเข้าระบบ", styles["ThaiSmall"])])
                except Exception:
                    evidence_page_content.append(Paragraph("ไม่สามารถอ่านข้อมูลภาพหน้านี้ได้", styles["ThaiBody"]))
            else:
                evidence_page_content.append(Paragraph("ไม่มีข้อมูลภาพของหน้านี้", styles["ThaiBody"]))
            story.append(KeepTogether(evidence_page_content))
    if not has_evidence_page:
        story.append(Paragraph("ภาพหลักฐาน", styles["ThaiTitle"]))
        story.append(Paragraph("ยังไม่มีภาพหลักฐานในรายการส่งออก", styles["ThaiSmall"]))

    story.extend([PageBreak(), Paragraph("บัญชีคุมแฮช", styles["ThaiTitle"])])
    hash_rows = [["ไฟล์", "SHA-256"]]
    for entry in manifest:
        hash_rows.append([clean_text(entry.get("fileName") or entry.get("filename")), clean_text(entry.get("sha256"))])
    if len(hash_rows) == 1:
        hash_rows.append(["-", "ยังไม่มีรายการแฮช"])

    hash_table = Table(hash_rows, colWidths=[60 * mm, 100 * mm])
    hash_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dcfce7")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.extend([hash_table, Spacer(1, 10)])

    story.append(Paragraph(
        "หมายเหตุ: ไฟล์นี้เป็น real exported PDF ที่สร้างจากข้อมูลสรุปของระบบ ไม่ใช่ภาพพิมพ์แบบ pixel-perfect จากหน้า preview ใน browser",
        styles["ThaiSmall"],
    ))
    doc.build(story)


def encrypt_if_needed(temp_pdf_path, output_path, password):
    reader = PdfReader(temp_pdf_path)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.add_metadata({
        "/Title": "Digital Evidence Export",
        "/Subject": "Digital evidence report export",
        "/Producer": "Digital Evidence local exporter",
        "/ProtectionStatus": "Protected" if password else "NoPassword",
    })
    if password:
        writer.encrypt(user_password=password, owner_password=password, algorithm="AES-256")
    with open(output_path, "wb") as f:
        writer.write(f)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--password", default="")
    parser.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args()
    password = sys.stdin.read() if args.password_stdin else args.password

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        temp_pdf_path = tmp.name
    try:
        build_pdf(args.input, temp_pdf_path)
        encrypt_if_needed(temp_pdf_path, args.output, password)
        print(json.dumps({
            "ok": True,
            "output": os.path.abspath(args.output),
            "encrypted": bool(password),
            "created_at": datetime.utcnow().isoformat() + "Z",
        }, ensure_ascii=False))
    finally:
        try:
            os.remove(temp_pdf_path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
