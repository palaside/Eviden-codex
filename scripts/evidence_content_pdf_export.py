import argparse
import base64
import io
import json
import os
import sys
import tempfile

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, SimpleDocTemplate

from encrypted_pdf_export import EvidencePageTextMarker, encrypt_if_needed


def decode_image_data(value):
    if not isinstance(value, str) or not value.startswith("data:image/") or "," not in value:
        raise ValueError("หน้าหลักฐานไม่มี imageData ที่ใช้ได้")
    try:
        return base64.b64decode(value.split(",", 1)[1], validate=True)
    except Exception as error:
        raise ValueError("imageData ของหน้าหลักฐานเสียหาย") from error


def build_evidence_content_pdf(payload, output_path):
    staged_items = payload.get("stagedItems")
    if not isinstance(staged_items, list):
        raise ValueError("ไม่พบรายการหน้าหลักฐาน")

    page_size = (A4[1], A4[0]) if payload.get("orientation") == "landscape" else A4
    page_width, page_height = page_size
    margin = 0.5 * mm
    frame_padding = 6
    image_width = page_width - 2 * margin - 2 * frame_padding
    image_height = page_height - 2 * margin - 2 * frame_padding
    doc = SimpleDocTemplate(
        output_path,
        pagesize=page_size,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title="Evidence Content Volume",
        author="Digital Evidence",
    )

    story = []
    for item in staged_items:
        file_name = item.get("fileName")
        pages = item.get("pages")
        if not isinstance(file_name, str) or not isinstance(pages, list):
            raise ValueError("รายการหลักฐานมี fileName/pages ไม่ถูกต้อง")
        for page_index, page in enumerate(pages):
            if not isinstance(page, dict):
                raise ValueError("ข้อมูลหน้าหลักฐานไม่ถูกต้อง")
            label = page.get("label")
            if not isinstance(label, str) or not label.strip():
                raise ValueError("หน้าหลักฐานไม่มี label สำหรับทำ page map")
            raw_image = decode_image_data(page.get("imageData"))
            if story:
                story.append(PageBreak())
            story.append(EvidencePageTextMarker(file_name, label))
            story.append(Image(io.BytesIO(raw_image), width=image_width, height=image_height, kind="proportional"))

    if not story:
        raise ValueError("ไม่มีหน้าภาพหลักฐานสำหรับสร้างเล่มเนื้อหา")
    doc.build(story)


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args()
    password = sys.stdin.read() if args.password_stdin else ""
    with open(args.input, "r", encoding="utf-8") as source:
        payload = json.load(source)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary:
        temp_pdf_path = temporary.name
    try:
        build_evidence_content_pdf(payload, temp_pdf_path)
        encrypt_if_needed(temp_pdf_path, args.output, password)
        print(json.dumps({"ok": True, "page_count": len(payload["stagedItems"])}, ensure_ascii=False))
    finally:
        try:
            os.remove(temp_pdf_path)
        except OSError:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
