#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
🏛️ DIGITAL EVIDENCE — CORRELATED EVIDENCE ENGINE (สกิล Only / only-corroborated)
📜 Executive Court Edition: Semantic Intent Keywords + Smoking Gun Pairing
==============================================================================
"""

import os
import sys
import re
import json
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Ensure stdout uses utf-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# 🎯 SSOT Legal Intent Keywords (ชุดคำสำคัญแห่งคดี)
LEGAL_INTENT_KEYWORDS = [
    "ขอยืม",
    "ขอกู้",
    "ขอเงิน",
    "ปล่อยกู้",
    "ยืมเงิน",
    "กู้เงิน",
    "ดอกเบี้ย",
    "ทวงหนี้",
    "โอนคืน",
    "สัญญา",
]

# Secondary Confirmation Keywords (คำสั่งโอน / ยืนยันสลิป)
TRANSFER_CONFIRMATION_KEYWORDS = [
    "โอนแล้ว",
    "โอนให้แล้ว",
    "ส่งสลิป",
    "แนบสลิป",
    "ยอดโอน",
    "เช็คยอด",
    "เช็กยอด",
    "ส่งให้แล้ว",
    "เรียบร้อยค่ะ",
    "เรียบร้อยครับ",
]

# Configure Tesseract path if available on Windows
try:
    import pytesseract
    tesseract_candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        r"C:\Users\EVE\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
    ]
    for p in tesseract_candidates:
        if os.path.exists(p):
            pytesseract.pytesseract.tesseract_cmd = p
            break
except ImportError:
    pytesseract = None


def scan_text_for_keywords(text: str, custom_keywords: Optional[List[str]] = None) -> List[str]:
    """
    Checks if any legal intent keywords are present in the provided text.
    """
    if not text:
        return []
    target_kws = custom_keywords or LEGAL_INTENT_KEYWORDS
    matched = []
    for kw in target_kws:
        if kw in text:
            matched.append(kw)
    return matched


def scan_image_ocr_text(img_path: str, tessdata_dir: Optional[str] = "tessdata") -> Tuple[str, List[str]]:
    """
    Performs OCR on a chat screenshot / slice and scans for legal intent keywords.
    """
    if pytesseract is None:
        return "", []
        
    try:
        import cv2
        from PIL import Image
        
        img = cv2.imread(img_path)
        if img is None:
            return "", []
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        tess_config = ""
        if tessdata_dir and os.path.exists(tessdata_dir):
            tess_config = f'--tessdata-dir "{tessdata_dir}" --psm 6'
            
        txt = pytesseract.image_to_string(gray, lang="tha+eng", config=tess_config)
        matched_kws = scan_text_for_keywords(txt)
        return txt, matched_kws
    except Exception as e:
        print(f"   ⚠️ OCR scan error for {img_path}: {e}")
        return "", []


def export_corroborated_excel(paired_records: List[Dict[str, Any]], out_path: str):
    """
    Exports a 10-column Executive Court Corroborated Ledger (Sarabun font, center-aligned).
    """
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Corroborated_Pairs"

    FONT_FAMILY = "Sarabun"
    font_title = Font(name=FONT_FAMILY, size=15, bold=True, color="1B365D")
    font_meta = Font(name=FONT_FAMILY, size=11, bold=True, color="333333")
    font_header = Font(name=FONT_FAMILY, size=11, bold=True, color="FFFFFF")
    font_data = Font(name=FONT_FAMILY, size=10, color="000000")
    font_data_bold = Font(name=FONT_FAMILY, size=10, bold=True, color="000000")
    font_kw = Font(name=FONT_FAMILY, size=10, bold=True, color="9C0006")
    font_disclaimer = Font(name=FONT_FAMILY, size=9, italic=True, color="666666")

    fill_header = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")
    fill_alt = PatternFill(start_color="F9FAFB", end_color="F9FAFB", fill_type="solid")
    fill_kw = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")

    thin_border = Side(style="thin", color="CCCCCC")
    cell_border = Border(left=thin_border, right=thin_border, top=thin_border, bottom=thin_border)
    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Title Block
    ws.merge_cells("A1:J1")
    ws["A1"] = "สารบัญพยานหลักฐานเชื่อมโยงแห่งคดี (Corroborated Evidence Ledger - Executive Court Edition)"
    ws["A1"].font = font_title
    ws["A1"].alignment = align_center

    ws.merge_cells("A2:J2")
    ws["A2"] = (
        f"คัดกรองเฉพาะคู่หลักฐานสำคัญ: [หน้าแชทตกลง/ทวงถาม/สั่งโอน ⟷ สลิปการเงินจริง] | "
        f"จำนวนคู่หลักฐาน: {len(paired_records)} รายการ"
    )
    ws["A2"].font = font_meta
    ws["A2"].alignment = align_center

    # Headers
    headers = [
        "ลำดับ", "หน้าแชทหลักฐาน", "คำสำคัญแห่งคดีที่ตรวจพบ", "หน้าระบุสลิป",
        "ยอดเงิน (บาท)", "วันที่โอน", "เวลา", "ธนาคารผู้รับ", "ชื่อผู้รับโอน", "เลขอ้างอิงธุรกรรม"
    ]
    
    ws.append([]) # Row 3
    ws.append(headers) # Row 4
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=4, column=c)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = align_center
        cell.border = cell_border

    # Rows
    row_num = 5
    total_amount = 0.0
    for idx, r in enumerate(paired_records, 1):
        amt_val = r.get("amount_val", 0.0)
        total_amount += amt_val
        
        ws.append([
            idx,
            r.get("chat_page_display", f"หน้า {r.get('chat_page', '-')}"),
            ", ".join(r.get("matched_keywords", [])),
            r.get("slip_page_display", f"หน้า {r.get('slip_page', '-')}"),
            amt_val,
            r.get("date", "-"),
            r.get("time", "-"),
            r.get("receiver_bank", "-"),
            r.get("receiver_name", "-"),
            r.get("remarks", "-"),
        ])
        
        for c in range(1, len(headers) + 1):
            cell = ws.cell(row=row_num, column=c)
            cell.font = font_data
            cell.border = cell_border
            cell.alignment = align_center
            
            if c == 5:
                cell.number_format = '#,##0.00'
                cell.font = font_data_bold
            elif c == 3:
                cell.font = font_kw
                cell.fill = fill_kw
            elif idx % 2 == 0:
                cell.fill = fill_alt
                
        row_num += 1

    # Total Summary
    ws.append(["", "รวมยอดเงินแห่งคดี", "", "", total_amount, "", "", "", "", ""])
    r_total = ws.max_row
    font_total = Font(name=FONT_FAMILY, size=11, bold=True, color="9C0006")
    fill_total = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=r_total, column=c)
        cell.font = font_total
        cell.fill = fill_total
        cell.border = cell_border
        cell.alignment = align_center
    ws.cell(row=r_total, column=5).number_format = '#,##0.00'

    # Disclaimer
    ws.append([])
    start_disc = ws.max_row + 1
    disc_cell = ws.cell(row=start_disc, column=1)
    disc_cell.value = (
        "หมายเหตุ: เอกสารฉบับนี้เป็นผลลัพธ์จากการคัดกรองพยานหลักฐานเชื่อมโยงแห่งคดี (Smoking Gun Pair)\n"
        "โดยตรวจจับคำสำคัญแห่งเจตนาทางคดีร่วมกับรายการโอนเงินจริง สอดคล้องตามต้นฉบับพยานหลักฐานดิจิทัลทุกประการ"
    )
    disc_cell.font = font_disclaimer
    disc_cell.alignment = align_center
    ws.merge_cells(f"A{start_disc}:J{start_disc + 1}")

    # Widths
    col_widths = [8, 16, 26, 16, 16, 14, 10, 20, 28, 26]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.paperSize = ws.PAPERSIZE_A4

    wb.save(out_path)


def main():
    parser = argparse.ArgumentParser(description="Correlated Evidence Engine (Skill Only)")
    parser.add_argument("--keywords", nargs="+", default=LEGAL_INTENT_KEYWORDS, help="Keywords to search for")
    parser.add_argument("--chat_pdf", type=str, default="Folder_Out/Evidence_Chat_Master_Combined_Vol1_to_3_With_Cover.pdf")
    parser.add_argument("--slip_cache", type=str, default="Folder_Out/slips_ocr_cache.json")
    parser.add_argument("--out", type=str, default="Folder_Out")

    args = parser.parse_args()

    print("=" * 70)
    print("🏛️ DIGITAL EVIDENCE — CORRELATED EVIDENCE ENGINE (สกิล Only)")
    print("   Executive Court Edition: Smoking Gun Pair Extractor")
    print("=" * 70)
    print(f"[*] Semantic Intent Keywords ({len(args.keywords)} words):")
    for kw in args.keywords:
        print(f"    • {kw}")
    print("=" * 70)


if __name__ == "__main__":
    main()
