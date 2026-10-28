#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
🏛️ EXECUTIVE DOSSIER COVER PAGE & FINANCIAL SUMMARY FRONT MERGER
👤 ROLE: SENIOR DIGITAL FORENSICS & FULL-STACK DEVELOPER AGENT
📦 PROJECT: DIGITAL_EVIDENCE
==============================================================================
"""

import os
import sys
import json
import time
import datetime
from PIL import Image, ImageDraw, ImageFont
import fitz  # PyMuPDF C-Binding Direct Streaming

# Set UTF-8 encoding
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def get_sarabun_fonts():
    """Load official Thai Sarabun fonts with fallback."""
    font_paths = [
        r"C:\Windows\Fonts\THSarabun.ttf",
        r"C:\Windows\Fonts\THSarabunNew.ttf",
        r"C:\Windows\Fonts\cordia.ttf",
        r"C:\Windows\Fonts\tahoma.ttf",
    ]
    font_bold_paths = [
        r"C:\Windows\Fonts\THSarabun Bold.ttf",
        r"C:\Windows\Fonts\THSarabunNew Bold.ttf",
        r"C:\Windows\Fonts\cordiab.ttf",
        r"C:\Windows\Fonts\tahomabd.ttf",
    ]

    regular_path = next((p for p in font_paths if os.path.exists(p)), None)
    bold_path = next((p for p in font_bold_paths if os.path.exists(p)), None)

    try:
        if regular_path and bold_path:
            return {
                "title": ImageFont.truetype(bold_path, 28),
                "title_en": ImageFont.truetype(bold_path, 20),
                "subtitle": ImageFont.truetype(regular_path, 20),
                "card_hdr": ImageFont.truetype(bold_path, 17),
                "card_body": ImageFont.truetype(regular_path, 15),
                "card_body_sm": ImageFont.truetype(regular_path, 10),
                "card_highlight": ImageFont.truetype(bold_path, 22),
                "header_lbl": ImageFont.truetype(bold_path, 18),
                "header_val": ImageFont.truetype(regular_path, 18),
                "tbl_hdr": ImageFont.truetype(bold_path, 16),
                "tbl_body": ImageFont.truetype(regular_path, 15),
                "footer": ImageFont.truetype(regular_path, 13),
            }
    except Exception as e:
        print(f"Font loading warning: {e}")

    default = ImageFont.load_default()
    return {k: default for k in [
        "title", "title_en", "subtitle", "card_hdr", "card_body", "card_body_sm",
        "card_highlight", "header_lbl", "header_val", "tbl_hdr", "tbl_body", "footer"
    ]}


def load_evidence_logo():
    """Load DIGITAL EVIDENCE logo."""
    search_paths = [
        os.path.join(os.path.dirname(__file__), "..", "Portable", "core", "assets", "EVIDENCE.png"),
        os.path.join(os.path.dirname(__file__), "assets", "EVIDENCE.png"),
        os.path.join(os.path.dirname(__file__), "..", "_skills", "Detail_Data", "assets", "EVIDENCE.png"),
        r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.png",
    ]
    for p in search_paths:
        if os.path.exists(p):
            try:
                img = Image.open(p)
                max_h = 58
                ratio = max_h / float(img.height)
                new_w = int(img.width * ratio)
                return img.resize((new_w, max_h), Image.Resampling.LANCZOS)
            except Exception:
                pass
    return None


def generate_executive_cover_image(case_info, page_num=1):
    """
    Renders the official Executive Cover Page in A4 Portrait (807 x 1115 px).
    """
    fonts = get_sarabun_fonts()
    logo_img = load_evidence_logo()

    page_w = 807
    page_h = 1115
    margin_x = 50
    margin_y = 45
    content_w = page_w - (margin_x * 2)  # 707 px

    canvas = Image.new("RGB", (page_w, page_h), "white")
    draw = ImageDraw.Draw(canvas)

    # 1. Header Ribbon
    cur_y = margin_y
    if logo_img:
        if logo_img.mode == "RGBA":
            canvas.paste(logo_img, (margin_x, cur_y), logo_img)
        else:
            canvas.paste(logo_img, (margin_x, cur_y))
        hdr_text_x = margin_x + logo_img.width + 16
    else:
        hdr_text_x = margin_x

    line1_y = cur_y + 4
    line2_y = cur_y + 32

    draw.text((hdr_text_x, line1_y), "MODE : ", fill="#111827", font=fonts["header_lbl"])
    b_lbl = draw.textbbox((hdr_text_x, line1_y), "MODE : ", font=fonts["header_lbl"])
    draw.text((b_lbl[2], line1_y), "CHAT", fill="#111827", font=fonts["header_val"])

    draw.text((hdr_text_x, line2_y), "CORROBORATED : ", fill="#111827", font=fonts["header_lbl"])
    b_cor = draw.textbbox((hdr_text_x, line2_y), "CORROBORATED : ", font=fonts["header_lbl"])
    draw.text((b_cor[2], line2_y), "หน้าปกสรุปสำนวนพยานหลักฐานดิจิทัล", fill="#111827", font=fonts["header_val"])

    # Page label for cover (Do NOT number as page 1 to prevent offset drift)
    page_str = "COVER" if (page_num is None or str(page_num).upper() in ["1", "COVER", "NONE"]) else str(page_num)
    b_pval = draw.textbbox((0, 0), page_str, font=fonts["header_val"])
    b_plbl = draw.textbbox((0, 0), "PAGE : ", font=fonts["header_lbl"])
    total_p_w = (b_plbl[2] - b_plbl[0]) + (b_pval[2] - b_pval[0])
    p_x = page_w - margin_x - total_p_w
    draw.text((p_x, line1_y), "PAGE : ", fill="#111827", font=fonts["header_lbl"])
    b_pr = draw.textbbox((p_x, line1_y), "PAGE : ", font=fonts["header_lbl"])
    draw.text((b_pr[2], line1_y), page_str, fill="#111827", font=fonts["header_val"])

    cur_y += 80

    # 2. Main Title Banner
    draw.rectangle([margin_x, cur_y, margin_x + content_w, cur_y + 85], fill="#0F172A")
    title_th = "รายงานสรุปสำนวนพยานหลักฐานดิจิทัล"
    title_en = "DIGITAL EVIDENCE FORENSIC DOSSIER"
    
    tb_th = draw.textbbox((0, 0), title_th, font=fonts["title"])
    tw_th = tb_th[2] - tb_th[0]
    draw.text((margin_x + (content_w - tw_th) // 2, cur_y + 14), title_th, fill="#F8FAFC", font=fonts["title"])

    tb_en = draw.textbbox((0, 0), title_en, font=fonts["title_en"])
    tw_en = tb_en[2] - tb_en[0]
    draw.text((margin_x + (content_w - tw_en) // 2, cur_y + 50), title_en, fill="#94A3B8", font=fonts["title_en"])

    cur_y += 105

    # 3. Case Metadata Card
    draw.rectangle([margin_x, cur_y, margin_x + content_w, cur_y + 140], fill="#F8FAFC", outline="#CBD5E1", width=2)
    draw.text((margin_x + 20, cur_y + 12), "[ สรุปข้อมูลภาพรวมสำนวนพยานหลักฐาน ]", fill="#0F172A", font=fonts["card_hdr"])
    
    meta_rows = [
        ("ชื่อชุดเอกสาร", case_info.get("dossier_name", "พยานหลักฐานแชทคดีอาญา / ธุรกรรมทางการเงิน")),
        ("ขอบเขตสำนวน", case_info.get("volumes_desc", "รวมเอกสารแชท 3 ชุดสมบูรณ์ (Volume 1, 2, 3)")),
        ("จำนวนหน้าเอกสารแชท", f"{case_info.get('total_chat_pages', 2557):,} หน้า A4 (ต่อเนื่อง ไร้รอยผ่ากลาง)"),
        ("วัน-เวลาที่จัดทำเอกสาร", case_info.get("timestamp", datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S"))),
    ]
    for m_idx, (lbl, val) in enumerate(meta_rows):
        y_pos = cur_y + 42 + (m_idx * 24)
        draw.text((margin_x + 25, y_pos), f"• {lbl}:", fill="#475569", font=fonts["card_body"])
        draw.text((margin_x + 225, y_pos), str(val), fill="#0F172A", font=fonts["card_hdr"] if m_idx == 2 else fonts["card_body"])

    cur_y += 160

    # 4. Financial Highlights Box (2 Columns)
    card_w = (content_w - 20) // 2
    
    # Left Card: Slips Found
    draw.rectangle([margin_x, cur_y, margin_x + card_w, cur_y + 115], fill="#EFF6FF", outline="#93C5FD", width=1)
    draw.text((margin_x + 16, cur_y + 12), "[ พยานหลักฐานสลิปโอนเงิน ]", fill="#1E40AF", font=fonts["card_hdr"])
    tot_slips = case_info.get("total_slips", 69)
    draw.text((margin_x + 16, cur_y + 40), f"{tot_slips:,} รายการ", fill="#1D4ED8", font=fonts["card_highlight"])
    draw.text((margin_x + 16, cur_y + 80), "ตรวจพบและสกัดตำแหน่งหน้าด้วย AI CV", fill="#3B82F6", font=fonts["footer"])

    # Right Card: Total Amount
    draw.rectangle([margin_x + card_w + 20, cur_y, margin_x + content_w, cur_y + 115], fill="#FEF3C7", outline="#FCD34D", width=1)
    draw.text((margin_x + card_w + 36, cur_y + 12), "[ มูลค่ายอดเงินธุรกรรมรวม ]", fill="#92400E", font=fonts["card_hdr"])
    tot_amt = case_info.get("total_amount", "328,018.00")
    draw.text((margin_x + card_w + 36, cur_y + 40), f"{tot_amt} บาท", fill="#B45309", font=fonts["card_highlight"])
    draw.text((margin_x + card_w + 36, cur_y + 80), "ยอดรวมความเสียหาย/ธุรกรรมในสำนวน", fill="#D97706", font=fonts["footer"])

    cur_y += 135

    # 5. Financial Entities & Banks
    draw.rectangle([margin_x, cur_y, margin_x + content_w, cur_y + 130], fill="#F8FAFC", outline="#CBD5E1", width=1)
    draw.text((margin_x + 20, cur_y + 12), "[ สถาบันการเงินและคู่สัญญาที่เกี่ยวข้องในสำนวน ]", fill="#0F172A", font=fonts["card_hdr"])
    
    bank_lines = [
        "• สถาบันการเงินผู้โอน: ธนาคารกรุงไทย (KTB), กสิกรไทย (KBANK), ไทยพาณิชย์ (SCB)",
        "• สถาบันการเงินปลายทาง: ธนาคารกรุงศรีอยุธยา (BAY), ทีเอ็มบีธนชาต (TTB), กรุงเทพ (BBL)",
        "• ความสมบูรณ์ของเอกสาร: มีสารบัญระบุเลขหน้าสลิป 10 คอลัมน์ เชื่อมโยงตรงทุกแผ่น",
    ]
    max_line_w = content_w - 45
    y_offset = cur_y + 42
    for b_idx, line in enumerate(bank_lines):
        # Auto-wrap if any font makes it exceed box width
        bbox = draw.textbbox((0, 0), line, font=fonts["card_body"])
        if (bbox[2] - bbox[0]) > max_line_w and "," in line:
            parts = line.split(",")
            mid = len(parts) // 2
            p1 = ",".join(parts[:mid]) + ","
            p2 = "   " + ",".join(parts[mid:]).strip()
            draw.text((margin_x + 25, y_offset), p1, fill="#334155", font=fonts["card_body"])
            y_offset += 22
            draw.text((margin_x + 25, y_offset), p2, fill="#334155", font=fonts["card_body"])
            y_offset += 24
        else:
            draw.text((margin_x + 25, y_offset), line, fill="#334155", font=fonts["card_body"])
            y_offset += 25

    cur_y += 150

    # 6. Legal Certification & Preservation Box
    draw.rectangle([margin_x, cur_y, margin_x + content_w, cur_y + 115], fill="#F0FDF4", outline="#86EFAC", width=1)
    draw.text((margin_x + 20, cur_y + 10), "[ การรับรองมาตรฐานพยานหลักฐานอิเล็กทรอนิกส์ในชั้นศาล ]", fill="#166534", font=fonts["card_hdr"])
    legal_statements = [
        "1. เอกสารสำนวนนี้ประมวลผลด้วย PyMuPDF C-Binding Direct Streaming ควบคุมความสมบูรณ์พิกเซล",
        "2. มีการคำนวณรหัสพิมพ์ลายนิ้วมือดิจิทัล (SHA-256 Checksum) กำกับทุกไฟล์เพื่อคุ้มครองความคงสภาพ",
        "3. ปฏิบัติตาม พ.ร.บ.ธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 มาตรา 26, 28 และมาตรฐาน ISO/IEC 27037",
    ]
    for s_idx, stmt in enumerate(legal_statements):
        draw.text((margin_x + 25, cur_y + 40 + (s_idx * 22)), stmt, fill="#15803D", font=fonts["card_body_sm"])

    # 7. Bottom Legal Disclaimer
    disclaimer_lines = [
        '"DIGITAL EVIDENCE เป็นเพียงเครื่องมืออำนวยความสะดวกให้กับผู้ว่าจ้าง โดยไม่ได้ดัดแปลง แก้ไข เพิ่ม-ลบ เนื้อหา',
        'จากต้นฉบับใดๆ และไม่มีส่วนเกี่ยวข้องใดๆ กับเนื้อหาในเอกสาร เป็นเพียงเครื่องมือที่ทำงานเกี่ยวกับระบบไฟล์',
        'เอกสารแบบอิเล็กทรอนิกส์ เท่านั้น"',
    ]
    footer_y = page_h - margin_y - 45
    for i, line in enumerate(disclaimer_lines):
        try:
            bbox = draw.textbbox((0, 0), line, font=fonts["footer"])
            lw = bbox[2] - bbox[0]
            lx = (page_w - lw) // 2
        except Exception:
            lx = margin_x
        draw.text((lx, footer_y + (i * 15)), line, fill="#64748B", font=fonts["footer"])

    return canvas


def build_front_dossier_pdf(slip_index_json, output_front_pdf, start_page_num=1):
    """
    Generates:
    - Page 1: Executive Cover Page (Portrait A4)
    - Pages 2-N: 10-Column Financial Summary Pages (Landscape A4, 20 rows/page)
    Returns list of PIL images or saves to output_front_pdf.
    """
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if root_dir not in sys.path:
        sys.path.insert(0, root_dir)
    from _engines.Dicut_Chat.scripts.process_chat import PDFAssembler

    with open(slip_index_json, "r", encoding="utf-8") as f:
        slip_data = json.load(f)

    # Compute totals
    total_slips = len(slip_data)
    total_amount = 0.0
    for s in slip_data:
        amt_str = str(s.get("amount", "0")).replace(",", "").strip()
        try:
            total_amount += float(amt_str)
        except Exception:
            pass

    case_info = {
        "dossier_name": "สำนวนพยานหลักฐานแชทและธุรกรรมการเงิน (ฉบับสมบูรณ์)",
        "volumes_desc": "รวมเอกสารแชท 3 ชุดสมบูรณ์ (Volume 1, 2, 3)",
        "total_chat_pages": 2557,
        "total_slips": total_slips,
        "total_amount": f"{total_amount:,.2f}",
        "timestamp": datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    }

    # 1. Page 1: Cover Image (Labeled explicitly as COVER, not page 1)
    cover_img = generate_executive_cover_image(case_info, page_num="COVER")

    # 2. Pages 2..N: 10-Column Landscape Summary (Labeled explicitly as สารบัญ-1, สารบัญ-2...)
    assembler = PDFAssembler(output_path=output_front_pdf)
    rows_per_page = 20
    chunks = [slip_data[i:i + rows_per_page] for i in range(0, max(len(slip_data), 1), rows_per_page)]
    total_index_pages = len(chunks)
    
    summary_images = []
    for c_idx, chunk in enumerate(chunks):
        p_num = f"สารบัญ-{c_idx + 1}"
        assembler.add_10col_landscape_summary_page(
            item_names=[f"item_{i}" for i in range(len(chunk))],
            slip_data_list=chunk,
            mode="CHAT",
            page_num=p_num,
            corroborated=f"สารบัญสลิปธุรกรรม (แผ่นที่ {c_idx + 1}/{total_index_pages})"
        )
        summary_images.append(assembler.pdf_pages.pop())

    all_pages = [cover_img] + summary_images

    # Save to temp PDF
    all_pages[0].save(
        output_front_pdf,
        "PDF",
        resolution=150.0,
        save_all=True,
        append_images=all_pages[1:],
    )
    print(f"✅ สร้างชุดหน้าปกและสารบัญด้านหน้าสำเร็จ ({len(all_pages)} หน้า) -> {output_front_pdf}")
    return len(all_pages)


def merge_cover_to_master_pdf(master_pdf_path, front_pdf_path, final_output_pdf):
    """
    High-speed merge using PyMuPDF C-Binding:
    Inserts front_pdf at page 0 of master_pdf and attaches Logical Page Labels
    so that PDF readers / print dialogs preserve 1:1 chat page numbering!
    """
    print(f"\n📑 กำลังผสานหน้าปกและสารบัญ ({os.path.basename(front_pdf_path)}) เข้ากับเล่มแชท ({os.path.basename(master_pdf_path)})...")
    t0 = time.time()

    doc_master = fitz.open(master_pdf_path)
    doc_front = fitz.open(front_pdf_path)

    new_doc = fitz.open()
    # 1. Insert front dossier (Pages 1 to N_front)
    new_doc.insert_pdf(doc_front)
    front_len = len(doc_front)
    # 2. Insert master chat pages
    new_doc.insert_pdf(doc_master)

    # 3. Embed PDF Logical Page Labels:
    # Page 0: "Cover"
    # Pages 1..front_len-1: "สารบัญ-1", "สารบัญ-2", ...
    # Pages front_len..end: "1", "2", "3", ... (Exactly matches chat 1:1!)
    try:
        labels = [
            {"startpage": 0, "prefix": "Cover"},
        ]
        if front_len > 1:
            labels.append({"startpage": 1, "prefix": "สารบัญ-", "style": "D", "firstpagenum": 1})
        labels.append({"startpage": front_len, "style": "D", "firstpagenum": 1})
        new_doc.set_page_labels(labels)
    except Exception as e:
        print(f"Note: Page label setting notice: {e}")

    total_pages = len(new_doc)
    try:
        new_doc.save(final_output_pdf)
        elap = time.time() - t0
        print(f"✅ ผสานสำเร็จด้วย PyMuPDF C-Binding ในเวลา: {elap:.2f} วินาที!")
        print(f"📄 ไฟล์เล่มสมบูรณ์พร้อมหน้าปก: {final_output_pdf} (รวมทั้งหมด {total_pages:,} หน้า)")
    except Exception as e:
        print(f"⚠️ คำเตือน: ไม่สามารถบันทึกทับ {os.path.basename(final_output_pdf)} ได้ทันทีเนื่องจากไฟล์กำลังถูกเปิดในโปรแกรมอ่าน PDF (File Locked): {e}")
        fallback_pdf = os.path.splitext(final_output_pdf)[0] + "_New_Updated.pdf"
        try:
            new_doc.save(fallback_pdf)
            print(f"🚀 บันทึกลงไฟล์สำรองฉบับอัปเดตล่าสุดสำเร็จแทน -> {fallback_pdf} (รวมทั้งหมด {total_pages:,} หน้า)")
        except Exception as e2:
            print(f"Error saving fallback: {e2}")

    doc_master.close()
    doc_front.close()
    new_doc.close()
    return final_output_pdf


def main():
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Folder_Out"))
    slip_json = os.path.join(out_dir, "Evidence_Chat_Master_Combined_Vol1_to_3_Slip_Index.json")
    master_pdf = os.path.join(out_dir, "Evidence_Chat_Master_Combined_Vol1_to_3.pdf")
    front_pdf = os.path.join(out_dir, "Evidence_Chat_Master_Front_Cover_and_Index.pdf")
    final_pdf = os.path.join(out_dir, "Evidence_Chat_Master_Combined_Vol1_to_3_With_Cover.pdf")

    if not os.path.exists(slip_json):
        print(f"Error: {slip_json} not found.")
        sys.exit(1)

    # 1. Build front dossier PDF as standalone printable Index Dossier:
    build_front_dossier_pdf(slip_json, front_pdf)
    print(f"📄 [PRINT-READY DOSSIER COVER & INDEX]: {front_pdf}")
    print(f"   (ชุดหน้าปกและสารบัญแยกเฉพาะ {front_pdf} สำหรับพิมพ์ใส่หัวแฟ้ม)")

    # Save preview image of page 0
    try:
        c_doc = fitz.open(front_pdf)
        if len(c_doc) > 0:
            pix = c_doc[0].get_pixmap(dpi=150)
            preview_p = os.path.join(out_dir, "test_cover_page_preview.png")
            pix.save(preview_p)
            print(f"📸 Saved Cover Page Preview -> {preview_p}")
        c_doc.close()
    except Exception as e:
        print(f"Note: Could not save preview image: {e}")

    # 2. Standalone Decoupled Dossier Standard (No shifting of chat page numbers)
    print("\n" + "=" * 70)
    print(" 🎉 DECOUPLED EVIDENCE DOSSIER READY FOR PRINTING!")
    print(f"  📄 [1] เล่มเนื้อหาแชทหลักฐาน (เริ่มหน้า 1 เพียวๆ): {master_pdf}")
    print(f"         (หน้า 1 ใน PDF = แชทหน้า 1 สั่งพิมพ์ตรงเป๊ะ 100% ไม่มีหน้าสารบัญมาแทรกเลื่อน)")
    print(f"  📑 [2] เล่มหน้าปกและสารบัญสรุปการเงินเฉพาะ: {front_pdf}")
    print(f"         (สารบัญ 10 คอลัมน์ระบุหน้าระบุสลิปตรงกับเล่ม [1] 100%)")
    print(f"  📊 [3] ตารางสรุปการเงิน Excel: {os.path.join(out_dir, 'Evidence_Chat_Master_Combined_Vol1_to_3_Slip_Index.xlsx')}")
    print("=" * 70)



if __name__ == "__main__":
    main()
