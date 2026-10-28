import argparse
import html
import json
import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from encrypted_pdf_export import clean_text, encrypt_if_needed, register_thai_font


HEADERS = [
    "หน้าระบุสลิป", "วันที่ - เวลา", "ธนาคารผู้โอน", "ชื่อผู้โอน", "จำนวนเงิน (บาท)",
    "ชื่อผู้รับโอน", "ธนาคารผู้รับ", "บันทึก", "รหัสอ้างอิง", "สถานะหลักฐาน",
]
WIDTH_WEIGHTS = [112, 130, 105, 188, 110, 208, 115, 90, 125, 105]


def safe_cell(value, index):
    if value is None:
        return "ต้องตรวจ" if index == 4 else ""
    if index in (0, 4):
        if isinstance(value, bool):
            raise ValueError("page/amount cell ต้องเป็นตัวเลขหรือข้อความ")
        if isinstance(value, (int, float)):
            if index == 0 and (not isinstance(value, int) or value < 1):
                raise ValueError("หน้าระบุสลิปต้องเป็นเลขหน้าจริงตั้งแต่ 1 ขึ้นไป")
            if index == 4:
                return f"{value:,.2f}"
            return str(value)
    if not isinstance(value, str):
        raise ValueError("ข้อมูลในตารางต้องเป็น string, number หรือ null")
    if len(value) > 2000:
        raise ValueError("ข้อความในช่องตารางยาวเกินกำหนด")
    return html.escape(clean_text(value), quote=False)


def build_summary_pdf(payload, output_path, password=""):
    case_number = payload.get("caseNumber", "")
    rows = payload.get("rows")
    if not isinstance(case_number, str) or len(case_number) > 256:
        raise ValueError("เลขอ้างอิงเรื่องไม่ถูกต้อง")
    if not isinstance(rows, list) or len(rows) > 10000:
        raise ValueError("rows ต้องเป็นรายการไม่เกิน 10,000 แถว")
    if any(not isinstance(row, list) or len(row) != 10 for row in rows):
        raise ValueError("แต่ละแถวต้องมีข้อมูล 10 คอลัมน์เท่านั้น")

    font_name = register_thai_font()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="IndexTitle", parent=styles["Title"], fontName=font_name, fontSize=20, leading=26, textColor=colors.HexColor("#0f172a"), alignment=1))
    styles.add(ParagraphStyle(name="IndexBody", parent=styles["BodyText"], fontName=font_name, fontSize=11, leading=16, textColor=colors.HexColor("#1e293b")))
    styles.add(ParagraphStyle(name="IndexCell", parent=styles["BodyText"], fontName=font_name, fontSize=7.5, leading=9, textColor=colors.HexColor("#111827")))
    styles.add(ParagraphStyle(name="IndexHeader", parent=styles["BodyText"], fontName=font_name, fontSize=7, leading=8, textColor=colors.white, alignment=1))

    page_width, _ = landscape(A4)
    left_margin = right_margin = 12.5 * mm
    available_width = page_width - left_margin - right_margin
    widths = [available_width * weight / sum(WIDTH_WEIGHTS) for weight in WIDTH_WEIGHTS]
    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(A4),
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=13 * mm,
        bottomMargin=16 * mm,
        title="Financial Summary and Slip Index",
        author="Digital Evidence",
    )
    story = [
        Spacer(1, 40 * mm),
        Paragraph("สารบัญสรุปรายการทางการเงิน", styles["IndexTitle"]),
        Spacer(1, 10 * mm),
        Paragraph(f"เลขอ้างอิงเรื่อง: {html.escape(clean_text(case_number))}", styles["IndexBody"]),
        Paragraph(f"จำนวนรายการ: {len(rows)}", styles["IndexBody"]),
        Spacer(1, 8 * mm),
        Paragraph("เอกสารนี้เป็นสารบัญแยกสำหรับเปิดคู่กับเล่มเนื้อหาพยานหลักฐาน โดยเลขหน้าระบุหน้าในเล่มเนื้อหาที่แยกต่างหาก", styles["IndexBody"]),
        PageBreak(),
    ]
    table_data = [[Paragraph(html.escape(header), styles["IndexHeader"]) for header in HEADERS]]
    if rows:
        for row in rows:
            table_data.append([
                Paragraph(safe_cell(value, index), styles["IndexCell"])
                for index, value in enumerate(row)
            ])
    else:
        table_data.append([Paragraph("ไม่พบรายการ", styles["IndexCell"])] + [""] * 9)
    table = LongTable(table_data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1b365d")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#94a3b8")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)

    def draw_index_page(canvas, document):
        page_number = canvas.getPageNumber()
        if page_number > 1:
            canvas.saveState()
            canvas.setFont(font_name, 8)
            canvas.setFillColor(colors.HexColor("#475569"))
            canvas.drawRightString(page_width - right_margin, 7 * mm, f"สารบัญ-{page_number - 1}")
            canvas.restoreState()

    doc.build(story, onFirstPage=draw_index_page, onLaterPages=draw_index_page)
    temp_path = output_path + ".unencrypted.pdf"
    os.replace(output_path, temp_path)
    try:
        encrypt_if_needed(temp_path, output_path, password)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args()
    password = sys.stdin.read() if args.password_stdin else ""
    with open(args.input, "r", encoding="utf-8") as source:
        payload = json.load(source)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    build_summary_pdf(payload, args.output, password)
    print(json.dumps({"ok": True, "record_count": len(payload.get("rows", []))}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
