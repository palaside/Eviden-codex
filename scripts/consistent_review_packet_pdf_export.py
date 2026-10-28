import argparse
import base64
import hashlib
import html
import io
import json
import os
import re
import sys
import tempfile

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Flowable, LongTable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from encrypted_pdf_export import clean_text, encrypt_if_needed, register_thai_font
from summary_table_pdf_export import HEADERS, WIDTH_WEIGHTS, safe_cell


SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)
IMAGE_DATA_URL_PATTERN = re.compile(r"^data:image/(png|jpeg);base64,([a-z0-9+/]+=*)$", re.IGNORECASE)
MAX_IMAGE_BYTES = 20 * 1024 * 1024


def decode_image(value, label):
    match = IMAGE_DATA_URL_PATTERN.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise ValueError(f"{label} ไม่มีภาพ PNG/JPEG base64 ที่ใช้ได้")
    try:
        data = base64.b64decode(match.group(2), validate=True)
    except Exception as error:
        raise ValueError(f"{label} มีข้อมูลภาพเสียหาย") from error
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError(f"{label} มีขนาดภาพเกินกำหนดหรือว่าง")
    return data


def validate_payload(payload):
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ValueError("schemaVersion ของ review packet ไม่รองรับ")
    case_number = payload.get("caseNumber")
    generated_at = payload.get("generatedAt")
    pairs = payload.get("pairs")
    rows = payload.get("summaryRows")
    if not isinstance(case_number, str) or not case_number.strip() or len(case_number) > 256:
        raise ValueError("เลขอ้างอิงเรื่องไม่ถูกต้อง")
    if not isinstance(generated_at, str) or len(generated_at) > 64:
        raise ValueError("เวลาออกรายงานไม่ถูกต้อง")
    if not isinstance(pairs, list) or not 1 <= len(pairs) <= 1000:
        raise ValueError("จำนวนคู่หลักฐานต้องอยู่ระหว่าง 1 ถึง 1,000 คู่")
    if not isinstance(rows, list) or len(rows) != len(pairs) or any(not isinstance(row, list) or len(row) != 10 for row in rows):
        raise ValueError("ต้องมีตารางสรุป 10 คอลัมน์ครบทุกคู่")

    for index, pair in enumerate(pairs):
        if not isinstance(pair, dict) or pair.get("reviewStatus") != "PENDING_HUMAN_REVIEW":
            raise ValueError(f"คู่ที่ {index + 1} ไม่ได้อยู่ในสถานะรอตรวจทาน")
        if not isinstance(pair.get("matchBasis"), str) or len(pair["matchBasis"]) > 100:
            raise ValueError(f"คู่ที่ {index + 1} ไม่มีฐาน candidate ที่ถูกต้อง")
        for side in ("chat", "slip"):
            item = pair.get(side)
            if not isinstance(item, dict):
                raise ValueError(f"คู่ที่ {index + 1} ขาดข้อมูล{side}")
            if not isinstance(item.get("sourceItemId"), str) or len(item["sourceItemId"]) > 256:
                raise ValueError(f"คู่ที่ {index + 1} ไม่มีรหัสต้นทาง{side} ที่ถูกต้อง")
            if not isinstance(item.get("fileName"), str) or len(item["fileName"]) > 512:
                raise ValueError(f"คู่ที่ {index + 1} ไม่มีชื่อไฟล์{side} ที่ถูกต้อง")
            if not isinstance(item.get("sha256"), str) or not SHA256_PATTERN.fullmatch(item["sha256"]):
                raise ValueError(f"คู่ที่ {index + 1} ไม่มี SHA-256 {side} ที่ถูกต้อง")
            decode_image(item.get("imageData"), f"ภาพ{side}คู่ที่ {index + 1}")


class CorroborationPairPage(Flowable):
    def __init__(self, pair, pair_count, case_number, generated_at, font_name):
        super().__init__()
        self.pair = pair
        self.pair_count = pair_count
        self.case_number = case_number
        self.generated_at = generated_at
        self.font_name = font_name

    def wrap(self, available_width, available_height):
        self.width = available_width
        self.height = available_height
        return self.width, self.height

    def _draw_image(self, canvas, item, x, y, width, height, caption):
        from reportlab.lib.utils import ImageReader

        image_data = decode_image(item["imageData"], caption)
        image_sha = hashlib.sha256(image_data).hexdigest()
        canvas.setStrokeColor(colors.HexColor("#94a3b8"))
        canvas.rect(x, y, width, height, stroke=1, fill=0)
        canvas.drawImage(ImageReader(io.BytesIO(image_data)), x + 3, y + 3, width=width - 6, height=height - 6,
                         preserveAspectRatio=True, anchor="c", mask="auto")
        canvas.setFont(self.font_name, 8)
        canvas.setFillColor(colors.HexColor("#0f172a"))
        canvas.drawString(x, y + height + 5, caption)
        canvas.setFont("Courier", 4.5)
        canvas.setFillColor(colors.HexColor("#334155"))
        source_hash = item["sha256"].lower()
        canvas.drawString(x, y - 10, f"Source SHA-256 (intake): {source_hash}")
        canvas.drawString(x, y - 18, f"Embedded image SHA-256: {image_sha}")
        return image_sha

    def draw(self):
        canvas = self.canv
        pair = self.pair
        gap = 12 * mm
        image_width = (self.width - gap) / 2
        image_height = min(300, self.height * 0.54)
        image_y = self.height - image_height - 78
        canvas.setFillColor(colors.HexColor("#0f172a"))
        canvas.setFont(self.font_name, 16)
        canvas.drawString(0, self.height - 20, "ชุดคู่หลักฐานเพื่อการตรวจทาน (Consistent Review Packet)")
        canvas.setFont(self.font_name, 9)
        canvas.drawString(0, self.height - 38, f"เลขเรื่อง: {self.case_number}  ·  คู่ที่ {pair['pairNumber']} / {self.pair_count}")
        canvas.setFillColor(colors.HexColor("#92400e"))
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(0, self.height - 53, "PENDING_HUMAN_REVIEW · Candidate only · Not a confirmed relationship")
        canvas.setFillColor(colors.HexColor("#334155"))
        canvas.setFont(self.font_name, 8)
        canvas.drawString(0, self.height - 68, f"ฐานสัญญาณ: {pair['matchBasis']}  ·  สร้างเมื่อ: {self.generated_at}")

        left_hash = self._draw_image(canvas, pair["chat"], 0, image_y, image_width, image_height,
                                     f"แชท · หน้า {pair['chat'].get('pageNumber', '-') } · {pair['chat']['fileName'][:42]}")
        right_hash = self._draw_image(canvas, pair["slip"], image_width + gap, image_y, image_width, image_height,
                                      f"สลิป · หน้าแฟ้ม PDF {pair['slip'].get('dossierPage') or '-'} · {pair['slip']['fileName'][:42]}")
        canvas.setFont(self.font_name, 7)
        canvas.setFillColor(colors.HexColor("#334155"))
        evidence_text = clean_text(pair.get("evidenceText", ""))[:260]
        evidence_paragraph = Paragraph(
            f"OCR evidence: {html.escape(evidence_text)}",
            ParagraphStyle(name=f"PairEvidence{pair['pairNumber']}", fontName=self.font_name, fontSize=7, leading=9, textColor=colors.HexColor("#334155")),
        )
        evidence_width, evidence_height = evidence_paragraph.wrap(self.width, 22)
        evidence_paragraph.drawOn(canvas, 0, image_y - 34 - evidence_height)
        canvas.setFont("Helvetica", 5)
        canvas.drawString(0, image_y - 40 - evidence_height, f"Embedded image SHA-256: chat={left_hash} · slip={right_hash}")


def build_review_packet_pdf(payload, output_path, password=""):
    validate_payload(payload)
    font_name = register_thai_font()
    page_width, _ = landscape(A4)
    margin = 12 * mm
    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(A4),
        leftMargin=margin,
        rightMargin=margin,
        topMargin=10 * mm,
        bottomMargin=14 * mm,
        title="Consistent Review Packet",
        author="Digital Evidence",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="PacketTitle", parent=styles["Title"], fontName=font_name, fontSize=17, leading=22, textColor=colors.HexColor("#0f172a")))
    styles.add(ParagraphStyle(name="PacketCell", parent=styles["BodyText"], fontName=font_name, fontSize=6.5, leading=8, textColor=colors.HexColor("#111827")))
    styles.add(ParagraphStyle(name="PacketHeader", parent=styles["BodyText"], fontName=font_name, fontSize=6, leading=7, textColor=colors.white, alignment=1))

    story = []
    for index, pair in enumerate(payload["pairs"]):
        if index:
            story.append(PageBreak())
        story.append(CorroborationPairPage(pair, len(payload["pairs"]), payload["caseNumber"], payload["generatedAt"], font_name))

    story.append(PageBreak())
    story.append(Paragraph("สารบัญคู่หลักฐาน 10 คอลัมน์", styles["PacketTitle"]))
    story.append(Paragraph(
        f"เลขเรื่อง: {html.escape(clean_text(payload['caseNumber']))} · จำนวนคู่ candidate: {len(payload['pairs'])} · สถานะทุกรายการ: รอตรวจทาน",
        styles["PacketCell"],
    ))
    story.append(Spacer(1, 5 * mm))
    available_width = page_width - 2 * margin
    widths = [available_width * weight / sum(WIDTH_WEIGHTS) for weight in WIDTH_WEIGHTS]
    rows = [[Paragraph(html.escape(header), styles["PacketHeader"]) for header in HEADERS]]
    for row in payload["summaryRows"]:
        rows.append([Paragraph(safe_cell(value, index), styles["PacketCell"]) for index, value in enumerate(row)])
    table = LongTable(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
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

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary:
        unprotected_path = temporary.name
    try:
        doc.filename = unprotected_path
        doc.build(story)
        encrypt_if_needed(unprotected_path, output_path, password)
    finally:
        try:
            os.remove(unprotected_path)
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args()
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    password = sys.stdin.read() if args.password_stdin else ""
    if len(password) > 256:
        raise ValueError("รหัสผ่านยาวเกินกำหนด")
    with open(args.input, "r", encoding="utf-8") as source:
        payload = json.load(source)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    build_review_packet_pdf(payload, args.output, password)
    print(json.dumps({"ok": True, "pair_count": len(payload["pairs"]), "summary_columns": 10}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
