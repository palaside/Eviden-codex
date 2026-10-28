#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automation script for Digital Evidence project.
Steps:
1. Ensure output folder "Folder_Out" exists.
2. Create Slip Index JSON (slip_index.json) if missing – copy example schema or generate from CanonicalEvidenceRecord.
3. Create dummy Master PDF (master_dummy.pdf) if missing – 5 blank pages.
4. Build front cover & index PDF (front_cover_index.pdf) using generate_cover_page functions.
5. Merge front PDF with master PDF → final_with_cover.pdf.
6. Capture page 4 as PNG and verify it contains the legal keyword.
"""
import os, sys, json, subprocess
from pathlib import Path

# Ensure PyMuPDF is available
try:
    import fitz  # PyMuPDF
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "PyMuPDF"])
    import fitz

# Project root and output directory
ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "Folder_Out"
OUT_DIR.mkdir(parents=True, exist_ok=True)
(OUT_DIR / "screenshots").mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. Slip source records -> slip_index.json (flat; final physical_page written in step 4c)
# ---------------------------------------------------------------------------
import argparse
sys.path.append(str(ROOT))
import net_detail as nd

_ap = argparse.ArgumentParser(description="Build final_with_cover.pdf (cover + legal + index + NET report + master)")
_ap.add_argument("--master", help="Path to the Master PDF (recommended; avoids auto-detect picking the wrong file)")
_ap.add_argument("--slips", help="Path to CanonicalEvidenceRecord JSON list (default: Folder_Out/slips_source.json)")
_args = _ap.parse_args()

SLIP_INDEX_PATH = OUT_DIR / "slip_index.json"
SLIPS_SOURCE_PATH = Path(_args.slips).resolve() if _args.slips else OUT_DIR / "slips_source.json"
if not SLIPS_SOURCE_PATH.exists():
    example_path = ROOT / "digital-evidence" / "slip_schema_example.json"
    if not example_path.exists():
        raise FileNotFoundError(f"No slip source: {SLIPS_SOURCE_PATH} (and no example schema to seed from)")
    with open(example_path, "r", encoding="utf-8") as f:
        _seed = json.load(f)
    with open(SLIPS_SOURCE_PATH, "w", encoding="utf-8") as f:
        json.dump(_seed if isinstance(_seed, list) else [_seed], f, ensure_ascii=False, indent=2)
    print(f"[WARN] No real slip source found; seeded DEMO data (1 example slip) -> {SLIPS_SOURCE_PATH.name}")
slip_records = nd.load_records(str(SLIPS_SOURCE_PATH))
_flat0, _ = nd.reconcile(slip_records, page_offset=0)
with open(SLIP_INDEX_PATH, "w", encoding="utf-8") as f:
    json.dump(nd.to_json_list(_flat0), f, ensure_ascii=False, indent=2)
print(f"[OK] Loaded {len(slip_records)} slip record(s) from {SLIPS_SOURCE_PATH.name}")

# ---------------------------------------------------------------------------
# 2. Master PDF (dummy if not present)
# ---------------------------------------------------------------------------

MASTER_PDF_PATH = None
if _args.master:
    MASTER_PDF_PATH = Path(_args.master).resolve()
    if not MASTER_PDF_PATH.is_file():
        print(f"[ERROR] --master file not found: {MASTER_PDF_PATH}")
        sys.exit(1)
else:
    print("[WARN] --master not given: falling back to auto-detect (may pick the wrong file)")
    # Search for a real Master PDF in the project (exclude generated PDFs in Folder_Out)
    candidate_pdfs = []
    for p in ROOT.rglob("*.pdf"):
        # Skip PDFs that are generated outputs
        if p.parent == OUT_DIR:
            continue
        if p.name.startswith("front_cover_index") or p.name.startswith("final_with_cover"):
            continue
        candidate_pdfs.append(p)
    # Prefer a PDF whose name contains 'master' (case-insensitive)
    master_candidates = [p for p in candidate_pdfs if "master" in p.name.lower()]
    if master_candidates:
        MASTER_PDF_PATH = master_candidates[0]
    else:
        # Fallback: pick the largest PDF (real data often larger than test snippets)
        MASTER_PDF_PATH = max(candidate_pdfs, key=lambda x: x.stat().st_size) if candidate_pdfs else None

if MASTER_PDF_PATH is None:
    print("[ERROR] Master PDF not found. Pass it explicitly: python prepare_and_generate.py --master <path>")
    sys.exit(1)
else:
    # Print only the filename to avoid Unicode issues
    print(f"[OK] Found Master PDF: {MASTER_PDF_PATH.name}")

# ---------------------------------------------------------------------------
# 3. Build front cover & index PDF
# ---------------------------------------------------------------------------
# Add project root to PYTHONPATH to import generate_cover_page
sys.path.append(str(ROOT))
from generate_cover_page import build_front_dossier_pdf, merge_cover_to_master_pdf

FRONT_PDF_PATH = OUT_DIR / "front_cover_index.pdf"
# Build the front dossier (cover + index)
build_front_dossier_pdf(str(SLIP_INDEX_PATH), str(FRONT_PDF_PATH))
print(f"[OK] Front cover & index PDF created at {FRONT_PDF_PATH}")

# ---------------------------------------------------------------------------
# 4. Merge front cover with master PDF
# ---------------------------------------------------------------------------
FINAL_PDF_PATH = OUT_DIR / "final_with_cover.pdf"
merge_cover_to_master_pdf(str(MASTER_PDF_PATH), str(FRONT_PDF_PATH), str(FINAL_PDF_PATH))
print(f"[OK] Merged front cover with master PDF saved at {FINAL_PDF_PATH}")

# ---------------------------------------------------------------------------
# 3b. Create Legal page PDF (one page with keyword and disclaimer)
# ---------------------------------------------------------------------------
LEGAL_PDF_PATH = OUT_DIR / "legal_page.pdf"
FONT_DIR = ROOT / "assets" / "fonts"
FONT_DIR.mkdir(parents=True, exist_ok=True)
FONT_URLS = {
    "Sarabun-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Bold.ttf",
    "Sarabun-Light.ttf": "https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Light.ttf",
}
import urllib.request
for _fname, _url in FONT_URLS.items():
    _fpath = FONT_DIR / _fname
    if not _fpath.exists() or _fpath.stat().st_size < 10000:
        urllib.request.urlretrieve(_url, str(_fpath))
        print(f"[OK] Downloaded font {_fname}")

LEGAL_HTML = """
<h1 style="font-family: SarabunB; font-size: 18pt; text-align: center;">การรับรองมาตรฐานพยานหลักฐานอิเล็กทรอนิกส์</h1>
<p style="font-family: SarabunL; font-size: 14pt; line-height: 1.6;">[Disclaimer] เอกสารชุดนี้ถูกรวบรวมและตรวจสอบความถูกต้องด้วยระบบอัตโนมัติ</p>
"""
LEGAL_CSS = """
@font-face { font-family: SarabunB; src: url(Sarabun-Bold.ttf); }
@font-face { font-family: SarabunL; src: url(Sarabun-Light.ttf); }
"""
# HTML/CSS layout via MuPDF Story (HarfBuzz shaping -> Thai vowels/tone marks render correctly)
_story = fitz.Story(html=LEGAL_HTML, user_css=LEGAL_CSS, archive=fitz.Archive(str(FONT_DIR)))
_writer = fitz.DocumentWriter(str(LEGAL_PDF_PATH))
_mediabox = fitz.paper_rect("a4")
_where = _mediabox + (72, 120, -72, -72)
_more = 1
while _more:
    _dev = _writer.begin_page(_mediabox)
    _more, _ = _story.place(_where)
    _story.draw(_dev)
    _writer.end_page()
_writer.close()
print(f"[OK] Legal page PDF created at {LEGAL_PDF_PATH}")

# ---------------------------------------------------------------------------
# 4b. Insert Legal page into final PDF as second page (after front cover)
# ---------------------------------------------------------------------------
final_doc = fitz.open(str(FINAL_PDF_PATH))
legal_doc = fitz.open(str(LEGAL_PDF_PATH))
# Append legal page to the end of the document
final_doc.insert_pdf(legal_doc)
# Move the appended page (last page) to position 1 (second page, after front cover)
last_page_index = final_doc.page_count - 1
final_doc.move_page(last_page_index, 1)
# PyMuPDF cannot save over the opened original non-incrementally -> write temp then replace
_tmp_final = OUT_DIR / "final_with_cover.tmp.pdf"
final_doc.save(str(_tmp_final), garbage=3, deflate=True)
final_doc.close()
legal_doc.close()
os.replace(str(_tmp_final), str(FINAL_PDF_PATH))
print(f"[OK] Legal page inserted into final PDF at position 2")

# ---------------------------------------------------------------------------
# 4c. NET Detail Report + page offset + logical page labels
#   Layout: Cover | Legal | Index(สารบัญ) | NET report (n pages) | chat 1..N
#   physical 1-based page of chat page p  =  p + PAGE_OFFSET
#   PAGE_OFFSET = FRONT_LEN (cover+index) + LEGAL_PAGES + NET_PAGES
#   Circular: report content shows physical pages, which depend on NET_PAGES -> iterate to a fixpoint.
# ---------------------------------------------------------------------------
LEGAL_PAGES = 1
with fitz.open(str(FRONT_PDF_PATH)) as _fd:
    FRONT_LEN = _fd.page_count
NET_PDF_PATH = OUT_DIR / "net_detail_report.pdf"

net_pages = 1
for _iter in range(5):
    PAGE_OFFSET = FRONT_LEN + LEGAL_PAGES + net_pages
    flat_slips, net_summary = nd.reconcile(slip_records, page_offset=PAGE_OFFSET)
    _n = nd.build_net_report_pdf(flat_slips, net_summary, NET_PDF_PATH, FONT_DIR)
    if _n == net_pages:
        break
    net_pages = _n
else:
    print("[FAIL] NET report page count did not converge")
    sys.exit(1)
print(f"[OK] NET Detail Report: {net_pages} page(s), PAGE_OFFSET={PAGE_OFFSET}")

_doc = fitz.open(str(FINAL_PDF_PATH))
with fitz.open(str(NET_PDF_PATH)) as _nd_doc:
    _doc.insert_pdf(_nd_doc, start_at=FRONT_LEN + LEGAL_PAGES)

_labels = [{"startpage": 0, "prefix": "Cover"},
           {"startpage": 1, "prefix": "Legal"}]
if FRONT_LEN > 1:
    _labels.append({"startpage": 2, "prefix": "Index-", "style": "D", "firstpagenum": 1})
_labels.append({"startpage": FRONT_LEN + LEGAL_PAGES, "prefix": "NET-", "style": "D", "firstpagenum": 1})
_labels.append({"startpage": PAGE_OFFSET, "style": "D", "firstpagenum": 1})
_doc.set_page_labels(_labels)

# Verify: chat page n must sit at physical index (n-1)+PAGE_OFFSET and carry label str(n)
with fitz.open(str(MASTER_PDF_PATH)) as _m:
    _master_len = _m.page_count
_ok = (_doc.page_count == _master_len + PAGE_OFFSET)
for _n in (1, 2, _master_len):
    _idx = (_n - 1) + PAGE_OFFSET
    _ok = _ok and _doc[_idx].get_label() == str(_n)
# Verify: the NET report text sits right after the index and legal page still page 2
_ok = _ok and ("NET Detail Report" in _doc[FRONT_LEN + LEGAL_PAGES].get_text())
print(f"[{'OK' if _ok else 'FAIL'}] PAGE_OFFSET={PAGE_OFFSET}: total={_doc.page_count} (master {_master_len}); "
      f"chat p1 -> physical {PAGE_OFFSET + 1}, label='{_doc[PAGE_OFFSET].get_label()}'")
_tmp2 = OUT_DIR / "final_with_cover.tmp.pdf"
_doc.save(str(_tmp2), garbage=3, deflate=True)
_doc.close()
os.replace(str(_tmp2), str(FINAL_PDF_PATH))

# slip_index.json (flat, with ref_id / amount / date / time / physical_page)
with open(SLIP_INDEX_PATH, "w", encoding="utf-8") as _f:
    json.dump(nd.to_json_list(flat_slips), _f, ensure_ascii=False, indent=2)
_with_pp = sum(1 for r in flat_slips if r["physical_page"] is not None)
print(f"[INFO] slip_index.json rewritten: {len(flat_slips)} slips, {_with_pp} with physical_page")
print(f"[INFO] Gross={net_summary['gross_amount']:,.2f} Net={net_summary['net_amount']:,.2f} "
      f"dup={net_summary['duplicate_n']} suspected={net_summary['suspected_n']} review={net_summary['needs_review_n']}")

# ---------------------------------------------------------------------------
# 4d. Cleanup temp files
# ---------------------------------------------------------------------------
import gc
for _name in ("_story", "_writer", "_dev"):
    globals().pop(_name, None)
gc.collect()
_failed = []
for _tmp in (LEGAL_PDF_PATH, NET_PDF_PATH, OUT_DIR / "final_with_cover.tmp.pdf"):
    try:
        if _tmp.exists():
            _tmp.unlink()
    except OSError as _e:
        _failed.append(_tmp.name)
        print(f"[WARN] Could not delete {_tmp.name}: {_e}")
print("[OK] Temp files cleaned" if not _failed else f"[WARN] Temp files remaining: {_failed}")

# ---------------------------------------------------------------------------
# 5. Dynamic search for legal keyword in all pages
LEGAL_KEYWORD = "การรับรองมาตรฐานพยานหลักฐานอิเล็กทรอนิกส์"

doc = fitz.open(str(FINAL_PDF_PATH))
found = False
for page_number in range(doc.page_count):
    page = doc.load_page(page_number)
    text = page.get_text("text")
    if LEGAL_KEYWORD in text:
        found = True
        # Render PNG of the found page
        pix = page.get_pixmap(dpi=150)
        png_path = OUT_DIR / "screenshots" / f"legal_page_found_at_p{page_number + 1}.png"
        pix.save(str(png_path))
        print(f"[OK] Legal keyword found on page {page_number + 1}. Screenshot saved at {png_path}")
        break

if not found:
    # Log warning – keyword not found in any page (e.g., dummy PDF)
    warning_path = OUT_DIR / "screenshots" / "legal_keyword_not_found.txt"
    with open(warning_path, "w", encoding="utf-8") as f:
        f.write("Legal keyword not found in any page of the final PDF.")
    print("[WARN] Verification failed: legal keyword NOT found in any page.")
    print(f"[INFO] Warning logged to {warning_path}")

doc.close()

print("--- All steps completed ---")

