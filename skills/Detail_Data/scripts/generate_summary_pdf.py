import sys
import os
import json
import datetime
from PIL import Image, ImageDraw, ImageFont


def get_sarabun_fonts():
    candidates_extralight = [
        r"C:\Windows\Fonts\Sarabun-ExtraLight.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-ExtraLight.ttf",
        r"C:\Windows\Fonts\Sarabun-Light.ttf",
    ]
    candidates_thin = [
        r"C:\Windows\Fonts\Sarabun-Thin.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-Thin.ttf",
        r"C:\Windows\Fonts\Sarabun-Light.ttf",
    ]
    candidates_light = [
        r"C:\Windows\Fonts\Sarabun-Light.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-Light.ttf",
        r"C:\Windows\Fonts\THSarabun.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
    ]
    candidates_bold = [
        r"C:\Windows\Fonts\Sarabun-Bold.ttf",
        r"C:\Users\EVE\AppData\Local\Microsoft\Windows\Fonts\Sarabun-Bold.ttf",
        r"C:\Windows\Fonts\THSarabun Bold.ttf",
        r"C:\Windows\Fonts\tahomabd.ttf",
    ]

    font_el_path = next((p for p in candidates_extralight if os.path.exists(p)), None)
    font_th_path = next((p for p in candidates_thin if os.path.exists(p)), None)
    font_light_path = next((p for p in candidates_light if os.path.exists(p)), None)
    font_bold_path = next((p for p in candidates_bold if os.path.exists(p)), None)

    try:
        f_hdr_lbl = ImageFont.truetype(font_el_path or "arial.ttf", 18)
        f_hdr_val = ImageFont.truetype(font_th_path or "arial.ttf", 18)
        f_footer = ImageFont.truetype(font_el_path or font_light_path or "arial.ttf", 16)
        f_header = ImageFont.truetype(font_bold_path or "arial.ttf", 18)
        f_title = ImageFont.truetype(font_bold_path or "arial.ttf", 15)
        f_tbl_hdr = ImageFont.truetype(font_bold_path or "arial.ttf", 12)
        f_body = ImageFont.truetype(font_light_path or "arial.ttf", 12)
        f_small = ImageFont.truetype(font_light_path or "arial.ttf", 11)
    except Exception:
        f_hdr_lbl = f_hdr_val = f_footer = f_header = f_title = f_tbl_hdr = f_body = f_small = ImageFont.load_default()

    return {
        "header_lbl": f_hdr_lbl,
        "header_val": f_hdr_val,
        "footer": f_footer,
        "header": f_header,
        "title": f_title,
        "table_header": f_tbl_hdr,
        "body": f_body,
        "small": f_small,
    }


def load_evidence_logo(target_h=75):
    candidates = [
        r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.png",
        r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.jpg",
        r"C:\Users\EVE\OneDrive\เดสก์ท็อป\unnamed.png",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "Dicut_Chat", "assets", "EVIDENCE.png"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "logo.png"),
    ]
    for p in candidates:
        if os.path.exists(p) and os.path.isfile(p):
            try:
                loaded = Image.open(p)
                scale = target_h / loaded.height
                target_w = int(loaded.width * scale)
                return loaded.resize((target_w, target_h), Image.Resampling.LANCZOS)
            except Exception:
                pass
    return None


def generate_summary_pdf(input_json_path, output_pdf_path, logo_img=None):
    """
    Renders the official 10-column Summary Table in A4 LANDSCAPE (1406 x 993 px)
    using Sarabun Light font, with 1202px expanded columns and centered cell contents.
    Chunks data into 20 rows per page if there are multiple records.
    """
    if isinstance(input_json_path, str) and os.path.exists(input_json_path):
        with open(input_json_path, "r", encoding="utf-8") as f:
            slip_data_list = json.load(f)
    elif isinstance(input_json_path, list):
        slip_data_list = input_json_path
    else:
        slip_data_list = []

    fonts = get_sarabun_fonts()
    if logo_img is None:
        logo_img = load_evidence_logo()

    disclaimer_lines = [
        '"DIGITAL EVIDENCE เป็นเพียงเครื่องมืออำนวยความสะดวกให้กับผู้ว่าจ้าง โดยไม่ได้ดัดแปลง แก้ไข เพิ่ม-ลบ เนื้อหา',
        'จากต้นฉบับใดๆ และไม่มีส่วนเกี่ยวข้องใดๆ กับเนื้อหาในเอกสาร เป็นเพียงเครื่องมือที่ทำงานเกี่ยวกับระบบไฟล์',
        'เอกสารแบบอิเล็กทรอนิกส์ เท่านั้น"',
    ]

    landscape_w = 1406
    landscape_h = 993
    margin_l = 102
    margin_r = 102
    margin_t = 80
    content_w = landscape_w - margin_l - margin_r  # 1202 px

    # 10 Columns definition (sum = 1202)
    col_w = [52, 105, 75, 125, 180, 110, 180, 125, 125, 125]
    headers = ["ลำดับ", "วันที่", "เวลา", "ธนาคารผู้โอน", "ชื่อผู้โอน", "จำนวนเงิน", "ชื่อผู้รับ", "ธนาคารผู้รับ", "บันทึกช่วยจำ", "หมายเหตุ"]

    rows_per_page = 20
    chunks = [slip_data_list[i:i + rows_per_page] for i in range(0, max(len(slip_data_list), 1), rows_per_page)]
    total_pages = len(chunks)

    pdf_pages = []

    for page_idx, chunk in enumerate(chunks):
        page_num = page_idx + 1
        canvas = Image.new("RGB", (landscape_w, landscape_h), "white")
        draw = ImageDraw.Draw(canvas)
        timestamp = datetime.datetime.now().strftime("%d/%m/%Y : %H.%M")

        # Header Block: Header Evidence Ribbon (A4 Landscape)
        header_y = 25
        if logo_img:
            if logo_img.mode == "RGBA":
                canvas.paste(logo_img, (margin_l, header_y), logo_img)
            else:
                canvas.paste(logo_img, (margin_l, header_y))
            text_x = margin_l + logo_img.width + 20
        else:
            text_x = margin_l

        line1_y = header_y + 8
        line2_y = header_y + 40

        # Mode line: MODE : SLIP
        draw.text((text_x, line1_y), "MODE : ", fill="#111827", font=fonts["header_lbl"])
        b_lbl = draw.textbbox((text_x, line1_y), "MODE : ", font=fonts["header_lbl"])
        draw.text((b_lbl[2], line1_y), "SLIP", fill="#111827", font=fonts["header_val"])

        # Corroborated line: สารบัญสรุปธุรกรรมทางการเงิน
        draw.text((text_x, line2_y), "CORROBORATED : ", fill="#111827", font=fonts["header_lbl"])
        b_corrob = draw.textbbox((text_x, line2_y), "CORROBORATED : ", font=fonts["header_lbl"])
        draw.text((b_corrob[2], line2_y), "สารบัญสรุปธุรกรรมทางการเงิน", fill="#111827", font=fonts["header_val"])

        # Page number on right
        page_str = f"{page_num} / {total_pages}" if total_pages > 1 else str(page_num)
        b_pval = draw.textbbox((0, 0), page_str, font=fonts["header_val"])
        b_plbl = draw.textbbox((0, 0), "PAGE : ", font=fonts["header_lbl"])
        total_page_w = (b_plbl[2] - b_plbl[0]) + (b_pval[2] - b_pval[0])
        page_x = landscape_w - margin_r - total_page_w

        draw.text((page_x, line1_y), "PAGE : ", fill="#111827", font=fonts["header_lbl"])
        b_pr = draw.textbbox((page_x, line1_y), "PAGE : ", font=fonts["header_lbl"])
        draw.text((b_pr[2], line1_y), page_str, fill="#111827", font=fonts["header_val"])

        # Title Box
        title_y = 110
        draw.rectangle([margin_l, title_y, margin_l + content_w, title_y + 40], fill="#F1F5F9", outline="#003366", width=2)
        title_text = "ใบสรุปรายการธุรกรรมทางการเงิน (DETAIL DATA SUMMARY STATEMENT)"
        try:
            bbox = draw.textbbox((0, 0), title_text, font=fonts["title"])
            title_w = bbox[2] - bbox[0]
            title_x = (landscape_w - title_w) // 2
        except Exception:
            title_x = margin_l + 20
        draw.text((title_x, title_y + 9), title_text, fill="#003366", font=fonts["title"])

        # Table Header
        tbl_top = title_y + 50
        cur_x = margin_l
        for i, h in enumerate(headers):
            draw.rectangle([cur_x, tbl_top, cur_x + col_w[i], tbl_top + 34], fill="#E2E8F0", outline="#333333", width=1)
            try:
                t_box = draw.textbbox((0, 0), h, font=fonts["table_header"])
                tw = t_box[2] - t_box[0]
                th = t_box[3] - t_box[1]
                tx = cur_x + (col_w[i] - tw) // 2
                ty = tbl_top + (34 - th) // 2 - 2
            except Exception:
                tx = cur_x + 5
                ty = tbl_top + 7
            draw.text((tx, ty), h, fill="black", font=fonts["table_header"])
            cur_x += col_w[i]

        # Table Rows (20 rows max per page)
        row_y = tbl_top + 34
        row_h = 30

        for r_idx in range(rows_per_page):
            cur_x = margin_l
            bg_col = "#FFFFFF" if r_idx % 2 == 0 else "#F8FAFC"

            if r_idx < len(chunk):
                item = chunk[r_idx]
                global_idx = r_idx + 1 + (page_idx * rows_per_page)
                vals = [
                    str(global_idx),
                    str(item.get("date", "-")),
                    str(item.get("time", "-")),
                    str(item.get("sender_bank", "-")),
                    str(item.get("sender_name", "-")),
                    str(item.get("amount", "-")),
                    str(item.get("receiver_name", "-")),
                    str(item.get("receiver_bank", "-")),
                    str(item.get("memo", "-")),
                    str(item.get("remarks", "-")),
                ]
            else:
                vals = [""] * 10

            for i, v in enumerate(vals):
                draw.rectangle([cur_x, row_y, cur_x + col_w[i], row_y + row_h], fill=bg_col, outline="#D1D5DB", width=1)
                if v:
                    try:
                        t_box = draw.textbbox((0, 0), str(v), font=fonts["body"])
                        tw = t_box[2] - t_box[0]
                        th = t_box[3] - t_box[1]
                        tx = cur_x + max(2, (col_w[i] - tw) // 2)
                        ty = row_y + max(1, (row_h - th) // 2) - 2
                    except Exception:
                        tx = cur_x + 5
                        ty = row_y + 6
                    draw.text((tx, ty), str(v), fill="#111827", font=fonts["body"])
                cur_x += col_w[i]
            row_y += row_h

        # Summary box
        summary_box_y = row_y + 10
        draw.rectangle([margin_l, summary_box_y, margin_l + content_w, summary_box_y + 34], fill="#EFF6FF", outline="#2563EB", width=1)
        sum_text = f"รวมรายการธุรกรรมสลิปทั้งหมด: {len(slip_data_list)} รายการ (หน้า {page_num}/{total_pages}) | ระบบสกัดพยานหลักฐานดิจิทัล Detail_Data ถูกต้องสมบูรณ์"
        try:
            bbox = draw.textbbox((0, 0), sum_text, font=fonts["body"])
            sw = bbox[2] - bbox[0]
            sx = (landscape_w - sw) // 2
        except Exception:
            sx = margin_l + 15
        draw.text((sx, summary_box_y + 8), sum_text, fill="#1E40AF", font=fonts["body"])

        # Footer Disclaimer Centered (Sarabun ExtraLight)
        footer_start_y = landscape_h - 85
        line_spacing = 22
        for i, line in enumerate(disclaimer_lines):
            try:
                bbox = draw.textbbox((0, 0), line, font=fonts["footer"])
                line_w = bbox[2] - bbox[0]
                line_x = (landscape_w - line_w) // 2
            except Exception:
                line_x = margin_l
            draw.text((line_x, footer_start_y + (i * line_spacing)), line, fill="#333333", font=fonts["footer"])

        pdf_pages.append(canvas)

    if pdf_pages:
        os.makedirs(os.path.dirname(os.path.abspath(output_pdf_path)), exist_ok=True)
        pdf_pages[0].save(
            output_pdf_path,
            "PDF",
            resolution=300.0,
            save_all=True,
            append_images=pdf_pages[1:],
        )
        print(f"Successfully created Detail_Data Summary PDF ({len(pdf_pages)} pages) -> {os.path.basename(output_pdf_path)}")
        return len(pdf_pages)
    return 0


def main():
    if len(sys.argv) < 3:
        print("Usage: python generate_summary_pdf.py <input_json> <output_pdf>")
        sys.exit(1)
    input_json = sys.argv[1]
    output_pdf = sys.argv[2]
    generate_summary_pdf(input_json, output_pdf)


if __name__ == "__main__":
    main()
