#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
🏛️ DIGITAL EVIDENCE — TARGET NAME MATCHER & FILTER ENGINE (สกิล Name)
📜 Protocol: "ชื่อตรง นามสกุลตรง นั้นคือถูก" (Strict First & Last Name Match, Zero Prefix Bias)
==============================================================================
"""

import os
import sys
import re
import json
import argparse
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Ensure stdout uses utf-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Comprehensive Thai and English honorifics / prefixes (sorted by length descending to match greedily)
HONORIFICS_PREFIXES = sorted([
    # Thai Long Titles & Military/Police
    "ว่าที่ร้อยตรีหญิง", "ว่าที่ร้อยตรี", "ว่าที่ ร.ต.หญิง", "ว่าที่ ร.ต.", "ว่าที่ ร.ต",
    "ว่าที่ร้อยโท", "ว่าที่ ร.ท.", "ว่าที่ร้อยเอก", "ว่าที่ ร.อ.",
    "พลตำรวจเอก", "พลตำรวจโท", "พลตำรวจตรี", "พล.ต.อ.", "พล.ต.ท.", "พล.ต.ต.",
    "พันตำรวจเอก", "พันตำรวจโท", "พันตำรวจตรี", "พ.ต.อ.", "พ.ต.ท.", "พ.ต.ต.",
    "ร้อยตำรวจเอก", "ร้อยตำรวจโท", "ร้อยตำรวจตรี", "ร.ต.อ.", "ร.ต.ท.", "ร.ต.ต.",
    "ดาบตำรวจ", "ด.ต.", "จ่าสิบตำรวจ", "จ.ส.ต.", "สิบตำรวจเอก", "สิบตำรวจโท", "สิบตำรวจตรี",
    "ส.ต.อ.", "ส.ต.ท.", "ส.ต.ต.",
    "พลเอก", "พลโท", "พลตรี", "พล.อ.", "พล.ท.", "พล.ต.",
    "พันเอก", "พันโท", "พันตรี", "พ.อ.", "พ.ท.", "พ.ต.",
    "ร้อยเอก", "ร้อยโท", "ร้อยตรี", "ร.อ.", "ร.ท.", "ร.ต.",
    "จ่าสิบเอก", "จ่าสิบโท", "จ่าสิบตรี", "จ.ส.อ.", "จ.ส.ท.", "จ.ส.ต.",
    "สิบเอก", "สิบโท", "สิบตรี", "ส.อ.", "ส.ท.", "ส.ต.",
    "พลทหาร",
    # Academic & Medical
    "ศาสตราจารย์ ดร.", "ศาสตราจารย์", "ศ.ดร.", "ศ.",
    "รองศาสตราจารย์ ดร.", "รองศาสตราจารย์", "รศ.ดร.", "รศ.",
    "ผู้ช่วยศาสตราจารย์ ดร.", "ผู้ช่วยศาสตราจารย์", "ผศ.ดร.", "ผศ.",
    "อาจารย์ ดร.", "อาจารย์", "อ.ดร.", "อ.",
    "นายแพทย์", "นพ.", "แพทย์หญิง", "พญ.",
    "ทันตแพทย์", "ทพ.", "ทันตแพทย์หญิง", "ทพญ.",
    "เภสัชกร", "ภก.", "เภสัชกรหญิง", "ภญ.",
    "สัตวแพทย์", "สพ.", "สัตวแพทย์หญิง", "สพญ.",
    "ดร.", "ดร",
    # Royal / Noble
    "หม่อมราชวงศ์", "ม.ร.ว.", "ม.ร.ว",
    "หม่อมหลวง", "ม.ล.", "ม.ล",
    "หม่อมเจ้า", "ม.จ.", "ม.จ",
    # General Civilians
    "นางสาว", "น.ส.", "น.ส", "นส.", "นส",
    "เด็กชาย", "ด.ช.", "ด.ช", "ดช.", "ดช",
    "เด็กหญิง", "ด.ญ.", "ด.ญ", "ดญ.", "ดญ",
    "นาย", "นาง", "คุณ", "ท่าน",
    # Religious
    "พระครูปลัด", "พระครู", "พระมหา", "พระอาจารย์", "พระภิกษุ", "พระ", "สามเณร",
    # Juristic / Organizations
    "บริษัทมหาชนจำกัด", "บริษัทจำกัด", "บริษัท", "บมจ.", "บจก.", "ห้างหุ้นส่วนจำกัด", "หจก.", "ร้าน",
    # English Titles
    "mr.", "mr", "mrs.", "mrs", "miss", "ms.", "ms",
    "dr.", "dr", "prof.", "prof", "assn.",
    "pol.gen.", "pol.maj.gen.", "pol.col.", "pol.lt.col.", "pol.maj.", "pol.capt.", "pol.lt.",
    "gen.", "lt.gen.", "maj.gen.", "col.", "lt.col.", "maj.", "capt.", "lt.", "sgt.",
], key=len, reverse=True)


def clean_raw_name_string(raw: str) -> str:
    """
    Strips bank accounts, parentheses, brackets, timestamps, and extraneous symbols from name string.
    Example: 'น.ส. จิณห์นิภา ประสาทเขตการ (XXX-X-XX452-9)' -> 'น.ส. จิณห์นิภา ประสาทเขตการ'
    """
    if not raw or raw.strip() == "-" or raw.strip() == "":
        return ""
    
    s = raw.strip()
    # Strip parenthesized accounts, e.g. (XXX-X-XX452-9), (1234), (พร้อมเพย์), etc.
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\[.*?\]", " ", s)
    s = re.sub(r"\{.*?\}", " ", s)
    
    # Strip standalone account numbers like XXX-X-XX452-9 or numbers
    s = re.sub(r"[Xx\d]{3,}[-\dXx]*", " ", s)
    
    # Strip common noise keywords in slips
    s = re.sub(r"(ผู้โอน|ผู้รับโอน|โอนเงินให้|จาก|ไปยัง|บัญชี|Account|Transfer to|From|To)\s*:", " ", s, flags=re.IGNORECASE)
    
    # Replace multiple whitespaces
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_honorifics(text: str) -> str:
    """
    Aggressively strips honorifics and prefixes from the beginning of the name.
    Matches greedily against HONORIFICS_PREFIXES.
    """
    s = text.strip()
    if not s:
        return ""
    
    changed = True
    while changed:
        changed = False
        s_lower = s.lower()
        for p in HONORIFICS_PREFIXES:
            p_lower = p.lower()
            if s_lower.startswith(p_lower):
                cut_len = len(p)
                remainder = s[cut_len:].strip()
                if len(remainder) >= 2:
                    s = remainder
                    s_lower = s.lower()
                    changed = True
                    break
    
    return s.strip()


def parse_first_and_last_name(raw: str) -> Tuple[str, str]:
    """
    Normalizes and splits a name into (first_name, last_name).
    Rule: 'ชื่อตรง นามสกุลตรง นั้นคือถูก'
    """
    cleaned = clean_raw_name_string(raw)
    without_prefix = strip_honorifics(cleaned)
    
    if not without_prefix:
        return "", ""
    
    tokens = without_prefix.split()
    if len(tokens) == 0:
        return "", ""
    elif len(tokens) == 1:
        return tokens[0], ""
    elif len(tokens) == 2:
        return tokens[0], tokens[1]
    else:
        return tokens[0], " ".join(tokens[1:])


def is_name_match(raw_evidence_name: str, target_first: str, target_last: str, allow_masked_surname: bool = True) -> bool:
    """
    Validates whether raw_evidence_name matches (target_first, target_last).
    Core Doctrine: "ไม่สนว่าจะมีคำนำหน้าว่าอะไร ชื่อตรง นามสกุลตรง นั้นคือถูก"
    """
    target_first = strip_honorifics(clean_raw_name_string(target_first)).strip().lower()
    target_last = clean_raw_name_string(target_last).strip().lower()
    
    ev_first, ev_last = parse_first_and_last_name(raw_evidence_name)
    ev_first = ev_first.strip().lower()
    ev_last = ev_last.strip().lower()
    
    if not ev_first or not target_first:
        return False
    
    # 1. First Name Check: Must match exactly
    if ev_first != target_first:
        return False
    
    # If target has no surname specified, matching first name is sufficient
    if not target_last:
        return True
    
    # 2. Last Name Check:
    if not ev_last:
        return False
    
    # Exact surname match
    if ev_last == target_last:
        return True
    
    # Banking Masked Surname Check (e.g. 'ป***' or 'ประสาท***' vs 'ประสาทเขตการ')
    if allow_masked_surname:
        if "*" in ev_last or "x" in ev_last:
            clean_ev_stem = re.sub(r"[\*xX]+", "", ev_last).strip()
            if clean_ev_stem and target_last.startswith(clean_ev_stem):
                return True
        if "*" in target_last or "x" in target_last:
            clean_target_stem = re.sub(r"[\*xX]+", "", target_last).strip()
            if clean_target_stem and ev_last.startswith(clean_target_stem):
                return True
                
    return False


def filter_slips_by_name(
    target_name: str,
    target_first: Optional[str] = None,
    target_last: Optional[str] = None,
    role: str = "any",  # 'sender', 'receiver', or 'any'
    cache_path: str = "Folder_Out/slips_ocr_cache.json",
    output_dir: str = "Folder_Out",
    generate_excel: bool = True,
    generate_pdf: bool = True,
    sample: bool = False,
) -> Dict[str, Any]:
    """
    Scans slips cache, extracts matching transactions, computes financial ledger,
    and produces forensic Excel and PDF dossiers.
    """
    if not target_first:
        parsed_f, parsed_l = parse_first_and_last_name(target_name)
        target_first = parsed_f
        if not target_last:
            target_last = parsed_l
            
    if not target_first:
        raise ValueError("Target first name cannot be empty.")

    target_full_display = f"{target_first} {target_last}".strip()
    print(f"🔍 Starting Target Name Matcher for: '{target_full_display}'")
    print(f"   Target First Name : '{target_first}'")
    print(f"   Target Last Name  : '{target_last}'")
    print(f"   Role Filter       : {role.upper()}")
    
    cache_file = Path(cache_path)
    if not cache_file.exists():
        raise FileNotFoundError(f"OCR cache file not found: {cache_path}")
        
    with open(cache_file, "r", encoding="utf-8") as f:
        cache_data = json.load(f)
        
    matched_records = []
    total_inflow = 0.0
    total_outflow = 0.0
    
    for filepath, rec in cache_data.items():
        sender_raw = rec.get("sender_name", "")
        receiver_raw = rec.get("receiver_name", "")
        
        is_sender_match = is_name_match(sender_raw, target_first, target_last)
        is_receiver_match = is_name_match(receiver_raw, target_first, target_last)
        
        match_role = None
        if is_sender_match and is_receiver_match:
            match_role = "BOTH"
        elif is_sender_match:
            match_role = "SENDER"
        elif is_receiver_match:
            match_role = "RECEIVER"
            
        if not match_role:
            continue
            
        if role.lower() == "sender" and match_role not in ["SENDER", "BOTH"]:
            continue
        if role.lower() == "receiver" and match_role not in ["RECEIVER", "BOTH"]:
            continue
            
        amount_str = rec.get("amount", "0.00").replace(",", "").strip()
        try:
            amount_val = float(amount_str)
        except ValueError:
            amount_val = 0.0
            
        if match_role in ["RECEIVER", "BOTH"]:
            total_inflow += amount_val
        if match_role in ["SENDER", "BOTH"]:
            total_outflow += amount_val
            
        record_entry = {
            "file_path": filepath,
            "filename": rec.get("filename", Path(filepath).name),
            "date": rec.get("date", "-"),
            "time": rec.get("time", "-"),
            "amount": rec.get("amount", "0.00"),
            "amount_val": amount_val,
            "match_role": match_role,
            "sender_bank": rec.get("sender_bank", "-"),
            "sender_name": sender_raw,
            "receiver_bank": rec.get("receiver_bank", "-"),
            "receiver_name": receiver_raw,
            "remarks": rec.get("remarks", "-"),
            "memo": rec.get("memo", "-"),
        }
        matched_records.append(record_entry)
        
    print(f"\n📊 Match Results:")
    print(f"   Found Transactions : {len(matched_records)} records")
    print(f"   Total Money In (รับโอน) : {total_inflow:,.2f} THB")
    print(f"   Total Money Out (โอนออก): {total_outflow:,.2f} THB")
    
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    clean_target_filename = re.sub(r'[^\w\d\u0E00-\u0E7F_-]', '_', f"{target_first}_{target_last}").strip('_')
    
    excel_path = None
    pdf_path = None
    
    if generate_excel and matched_records:
        excel_filename = f"Evidence_Target_{clean_target_filename}.xlsx"
        excel_path = out_dir / excel_filename
        export_target_excel(matched_records, target_full_display, str(excel_path), total_inflow, total_outflow)
        print(f"   ✅ Saved Excel Ledger: {excel_path}")
        
    if generate_pdf and matched_records:
        pdf_prefix = "SAMPLE_" if sample else ""
        pdf_filename = f"{pdf_prefix}Evidence_Target_{clean_target_filename}.pdf"
        pdf_path = out_dir / pdf_filename
        export_target_pdf(matched_records, target_full_display, str(pdf_path), str(excel_path) if excel_path else None, sample=sample)
        print(f"   ✅ Saved PDF Dossier: {pdf_path}")
        
    return {
        "target_name": target_full_display,
        "target_first": target_first,
        "target_last": target_last,
        "total_matches": len(matched_records),
        "total_inflow": total_inflow,
        "total_outflow": total_outflow,
        "records": matched_records,
        "excel_path": str(excel_path) if excel_path else None,
        "pdf_path": str(pdf_path) if pdf_path else None,
    }


def export_target_excel(records: List[Dict[str, Any]], target_name: str, out_path: str, total_inflow: float, total_outflow: float):
    """
    Exports a 10-column financial ledger formatted according to Chat_Evidence Sarabun Center-Aligned Grid.
    """
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Target_Evidence_Ledger"
    
    FONT_FAMILY = "Sarabun"
    font_title = Font(name=FONT_FAMILY, size=15, bold=True, color="1B365D")
    font_meta = Font(name=FONT_FAMILY, size=11, bold=True, color="333333")
    font_header = Font(name=FONT_FAMILY, size=11, bold=True, color="FFFFFF")
    font_data = Font(name=FONT_FAMILY, size=10, bold=False, color="000000")
    font_data_bold = Font(name=FONT_FAMILY, size=10, bold=True, color="000000")
    font_total = Font(name=FONT_FAMILY, size=11, bold=True, color="9C0006")
    font_disclaimer = Font(name=FONT_FAMILY, size=9, italic=True, color="666666")

    fill_header = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")
    fill_alt = PatternFill(start_color="F9FAFB", end_color="F9FAFB", fill_type="solid")
    fill_total = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
    fill_sender = PatternFill(start_color="E1DFDD", end_color="E1DFDD", fill_type="solid")
    fill_receiver = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")

    thin_border = Side(style="thin", color="CCCCCC")
    double_border = Side(style="double", color="333333")
    cell_border = Border(left=thin_border, right=thin_border, top=thin_border, bottom=thin_border)

    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Title Block
    ws.merge_cells("A1:K1")
    ws["A1"] = f"รายงานสรุปรายการธุรกรรมทางการเงินเฉพาะบุคคล (Individual Forensic Evidence Ledger)"
    ws["A1"].font = font_title
    ws["A1"].alignment = align_center

    ws.merge_cells("A2:K2")
    ws["A2"] = f"บุคคลเป้าหมาย (Person of Interest): {target_name} | จำนวนรายการที่ตรวจพบ: {len(records)} รายการ"
    ws["A2"].font = font_meta
    ws["A2"].alignment = align_center

    # Headers
    headers = [
        "ลำดับ", "บทบาท", "วันที่", "เวลา", "ยอดเงิน (บาท)",
        "ธนาคารผู้โอน", "ชื่อผู้โอน", "ธนาคารผู้รับ", "ชื่อผู้รับโอน",
        "เลขอ้างอิงธุรกรรม", "ชื่อไฟล์ภาพหลักฐาน"
    ]
    
    ws.append([]) # Row 3 blank
    ws.append(headers) # Row 4
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=4, column=col_idx)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = align_center
        cell.border = cell_border

    # Data Rows
    row_num = 5
    for idx, r in enumerate(records, 1):
        ws.append([
            idx,
            "ผู้รับโอน (In)" if r["match_role"] == "RECEIVER" else ("ผู้โอน (Out)" if r["match_role"] == "SENDER" else "โอนระหว่างตนเอง"),
            r["date"],
            r["time"],
            r["amount_val"],
            r["sender_bank"],
            r["sender_name"],
            r["receiver_bank"],
            r["receiver_name"],
            r["remarks"],
            r["filename"]
        ])
        
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_num, column=col_idx)
            cell.font = font_data
            cell.border = cell_border
            cell.alignment = align_center
            
            if col_idx == 5:
                cell.number_format = '#,##0.00'
                cell.font = font_data_bold
            elif col_idx == 2:
                if r["match_role"] == "RECEIVER":
                    cell.fill = fill_receiver
                else:
                    cell.fill = fill_sender
            elif idx % 2 == 0:
                cell.fill = fill_alt
                
        row_num += 1

    # Total Summary Rows
    # 1. Total Inflow
    ws.append(["", "รวมยอดรับโอน (Inflow)", "", "", total_inflow, "", "", "", "", "", ""])
    r_in = ws.max_row
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=r_in, column=c)
        cell.font = font_total
        cell.fill = fill_total
        cell.border = cell_border
        cell.alignment = align_center
    ws.cell(row=r_in, column=5).number_format = '#,##0.00'

    # 2. Total Outflow
    ws.append(["", "รวมยอดโอนออก (Outflow)", "", "", total_outflow, "", "", "", "", "", ""])
    r_out = ws.max_row
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=r_out, column=c)
        cell.font = font_total
        cell.fill = fill_total
        cell.border = cell_border
        cell.alignment = align_center
    ws.cell(row=r_out, column=5).number_format = '#,##0.00'

    # Disclaimer
    ws.append([])
    start_disc_row = ws.max_row + 1
    disc_cell = ws.cell(row=start_disc_row, column=1)
    disc_cell.value = (
        "หมายเหตุ: เอกสารฉบับนี้เป็นผลลัพธ์จากการสกัดข้อมูลพยานหลักฐานดิจิทัลอัตโนมัติ ภายใต้กระบวนการ 'ชื่อตรง นามสกุลตรง นั้นคือถูก'\n"
        "โดยไม่นำคำนำหน้าชื่อมาเป็นเงื่อนไขตัดสิทธิ์ ข้อมูลตัวเลขและคู่ธุรกรรมสอดคล้องตามภาพสลิปต้นฉบับทุกประการ"
    )
    disc_cell.font = font_disclaimer
    disc_cell.alignment = align_center
    ws.merge_cells(f"A{start_disc_row}:K{start_disc_row + 1}")

    # Column Widths
    col_widths = [8, 18, 14, 10, 16, 18, 30, 18, 30, 26, 26]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Page Setup Landscape A4
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.paperSize = ws.PAPERSIZE_A4

    wb.save(out_path)


def _get_target_fonts():
    f_extralight = r"C:\Windows\Fonts\Sarabun-ExtraLight.ttf"
    f_thin = r"C:\Windows\Fonts\Sarabun-Thin.ttf"
    f_reg = r"C:\Windows\Fonts\Sarabun-Regular.ttf"
    f_bold = r"C:\Windows\Fonts\Sarabun-Bold.ttf"
    f_light = r"C:\Windows\Fonts\Sarabun-Light.ttf"
    fallback = r"C:\Windows\Fonts\tahoma.ttf"

    from PIL import ImageFont

    def _f(path, size):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
        if os.path.exists(fallback):
            try:
                return ImageFont.truetype(fallback, size)
            except Exception:
                pass
        return ImageFont.load_default()

    return {
        "header_lbl": _f(f_extralight, 17),
        "header_val": _f(f_thin, 17),
        "header_bold": _f(f_bold, 18),
        "footer": _f(f_extralight, 16),
        "table_hdr": _f(f_bold, 13),
        "table_body": _f(f_light, 12),
        "table_small": _f(f_light, 11),
        "thin_path": f_thin if os.path.exists(f_thin) else f_light,
        "light_path": f_light if os.path.exists(f_light) else fallback,
    }


def _get_target_logo(target_h=75):
    from PIL import Image
    cur = Path(__file__).resolve().parent
    candidates = [
        cur / "EVIDENCE.png",
        cur.parent / "EVIDENCE.png",
        Path(r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.png"),
        Path(r"C:\Users\EVE\OneDrive\เดสก์ท็อป\EVIDENCE.jpg"),
        cur / "_engines" / "Dicut_Chat" / "assets" / "EVIDENCE.png",
        cur.parent / "_engines" / "Dicut_Chat" / "assets" / "EVIDENCE.png",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            try:
                raw = Image.open(str(p))
                scale = target_h / float(raw.height)
                target_w = int(raw.width * scale)
                return raw.resize((target_w, target_h), Image.Resampling.LANCZOS)
            except Exception:
                pass
    return None


DISCLAIMER_LINES = [
    '"DIGITAL EVIDENCE เป็นเพียงเครื่องมืออำนวยความสะดวกให้กับผู้ว่าจ้าง โดยไม่ได้ดัดแปลง แก้ไข เพิ่ม-ลบ เนื้อหา',
    'จากต้นฉบับใดๆ และไม่มีส่วนเกี่ยวข้องใดๆ กับเนื้อหาในเอกสาร เป็นเพียงเครื่องมือที่ทำงานเกี่ยวกับระบบไฟล์',
    'เอกสารแบบอิเล็กทรอนิกส์ เท่านั้น"'
]


def export_target_pdf(records: List[Dict[str, Any]], target_name: str, out_pdf_path: str, excel_path: Optional[str] = None, sample: bool = False):
    """
    Assembles a dedicated court-ready PDF dossier containing all slips of the target person,
    strictly adhering to the Official Reference Standard:
    1. Header Evidence Ribbon (MODE : TARGET EVIDENCE, CORROBORATED details, PAGE stamp, EVIDENCE Logo)
    2. Slip-Block-Fit Protocol (645x890 block canvas centered at (322.5, 445))
    3. Footer Legal Disclaimer (3 lines Sarabun Light centered)
    4. Optional 10-Column Landscape Summary Statement Table appended at end
    If sample is True, outputs strictly 1 real page preview + PNG companion.
    """
    from PIL import Image, ImageDraw

    # Try import forensic_smart_zoom_crop if available
    smart_crop_func = None
    try:
        from process_chat import forensic_smart_zoom_crop
        smart_crop_func = forensic_smart_zoom_crop
    except ImportError:
        cur = Path(__file__).resolve().parent
        for _ in range(4):
            candidate = cur / "_engines" / "Dicut_Chat" / "scripts"
            candidate_core = cur / "core"
            if candidate.exists():
                sys.path.insert(0, str(candidate))
                break
            if (candidate_core / "process_chat.py").exists():
                sys.path.insert(0, str(candidate_core))
                break
            cur = cur.parent
        try:
            from process_chat import forensic_smart_zoom_crop
            smart_crop_func = forensic_smart_zoom_crop
        except ImportError:
            smart_crop_func = None

    # SSOT Evidence Theme integration
    try:
        from core.evidence_theme import (
            load_evidence_fonts,
            load_evidence_logo,
            apply_header_ribbon,
            apply_footer_disclaimer,
            extract_pure_slip_card,
            fit_slip_block,
            DISCLAIMER_LINES,
        )
    except ImportError:
        try:
            from evidence_theme import (
                load_evidence_fonts,
                load_evidence_logo,
                apply_header_ribbon,
                apply_footer_disclaimer,
                extract_pure_slip_card,
                fit_slip_block,
                DISCLAIMER_LINES,
            )
        except ImportError:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))
            from evidence_theme import (
                load_evidence_fonts,
                load_evidence_logo,
                apply_header_ribbon,
                apply_footer_disclaimer,
                extract_pure_slip_card,
                fit_slip_block,
                DISCLAIMER_LINES,
            )

    fonts = load_evidence_fonts()
    logo_img = load_evidence_logo(target_h=75)

    pw, ph = 993, 1406
    TW, TH = 645, 890

    if sample:
        records_to_process = records
        summary_chunks = []
        total_pages = 1
    else:
        records_to_process = records
        # Calculate total pages: slip pages + landscape table pages (20 rows per page)
        rows_per_page = 20
        summary_chunks = [records[i:i + rows_per_page] for i in range(0, len(records), rows_per_page)]
        total_pages = len(records) + len(summary_chunks)

    rendered_pages = []

    # --- Part 1: Individual Slip Pages (slip-block-fit 645x890) ---
    for idx, r in enumerate(records_to_process, 1):
        img_path = r.get("file_path", "")
        
        # Intelligent Path Resolution: check original path or local workspace Done/
        if not os.path.exists(img_path):
            fname = Path(img_path).name
            candidates = [
                PROJECT_ROOT / "Done" / fname,
                PROJECT_ROOT / "raw_images" / fname,
                Path("Done") / fname,
            ]
            for c in candidates:
                if c.exists():
                    img_path = str(c)
                    break
        else:
            # Check if file has read permission, fallback to local Done/ if locked
            try:
                with open(img_path, "rb") as _:
                    pass
            except Exception:
                fname = Path(img_path).name
                local_done = PROJECT_ROOT / "Done" / fname
                if local_done.exists():
                    img_path = str(local_done)

        if not os.path.exists(img_path):
            continue

        try:
            # Read image cleanly via PIL and apply pure slip card isolation
            raw_pil = Image.open(img_path).convert("RGB")
            slip_pil = extract_pure_slip_card(raw_pil)

            # slip-block-fit via SSOT Theme (Full-block proportional fill, aspect ratio locked)
            block_canvas = fit_slip_block(slip_pil, target_w=TW, target_h=TH)

            # Assemble A4 Portrait
            a4 = Image.new("RGB", (pw, ph), "white")
            paste_x = (pw - TW) // 2
            paste_y = 120 + ((1200 - TH) // 2)
            a4.paste(block_canvas, (paste_x, paste_y))

            # Header Evidence Ribbon via Central SSOT Theme
            role_th = "ผู้รับเงิน" if r.get("match_role") == "RECEIVER" else ("ผู้โอนเงิน" if r.get("match_role") == "SENDER" else r.get("match_role", "-"))
            amt_str = f"{r.get('amount', '0.00')} บาท"
            dt_raw = f"{r.get('date', '')} {r.get('time', '')}".strip()
            corrob_str = f"บุคคลเป้าหมาย: {target_name} | ลำดับที่ {idx:02d}/{len(records)} | บทบาท: {role_th} | ยอดเงิน: {amt_str}"
            if dt_raw:
                corrob_str += f" ({dt_raw})"

            page_str = f"{idx} / {total_pages}"
            apply_header_ribbon(
                canvas=a4,
                mode="TARGET EVIDENCE",
                corroborated=corrob_str,
                page_str=page_str,
                fonts=fonts,
                logo_img=logo_img,
                is_landscape=False
            )

            # Footer Disclaimer via Central SSOT Theme
            apply_footer_disclaimer(
                canvas=a4,
                fonts=fonts,
                is_landscape=False
            )

            rendered_pages.append(a4)
            if sample:
                break

        except Exception as e:
            print(f"   ⚠️ Error assembling target slip {img_path}: {e}")

    # --- Part 2: Landscape Summary Statement Table Pages ---
    lw, lh = 1406, 993
    col_w = [52, 105, 75, 125, 180, 110, 180, 125, 125, 125]
    headers_land = ["ลำดับ", "วันที่", "เวลา", "ธนาคารผู้โอน", "ชื่อผู้โอน", "จำนวนเงิน", "ชื่อผู้รับ", "ธนาคารผู้รับ", "บันทึกช่วยจำ", "หมายเหตุ (Ref)"]
    row_h = 32

    for c_idx, chunk in enumerate(summary_chunks):
        land_canvas = Image.new("RGB", (lw, lh), "white")
        draw_l = ImageDraw.Draw(land_canvas)

        # Header Evidence Ribbon via SSOT Theme
        start_row_num = (c_idx * rows_per_page) + 1
        end_row_num = start_row_num + len(chunk) - 1
        corrob_land = f"ตารางสรุปรายการธุรกรรมบุคคลเป้าหมาย: {target_name} (ลำดับที่ {start_row_num} - {end_row_num})"
        dossier_p_num = len(rendered_pages) + 1
        page_str = f"{dossier_p_num} / {total_pages}"

        apply_header_ribbon(
            canvas=land_canvas,
            mode="STATEMENT / TARGET SUMMARY TABLE",
            corroborated=corrob_land,
            page_str=page_str,
            fonts=fonts,
            logo_img=logo_img,
            is_landscape=True
        )

        # Table Grid
        start_x = 102
        start_y = 115
        cur_x = start_x
        for i, (h_title, cw) in enumerate(zip(headers_land, col_w)):
            draw_l.rectangle([cur_x, start_y, cur_x + cw, start_y + row_h], fill="#1E3A8A", outline="#CBD5E1")
            bbox = draw_l.textbbox((0, 0), h_title, font=fonts["table_hdr"])
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            draw_l.text((cur_x + (cw - tw) // 2, start_y + (row_h - th) // 2), h_title, fill="#FFFFFF", font=fonts["table_hdr"])
            cur_x += cw

        for r_idx, item in enumerate(chunk):
            y_top = start_y + ((r_idx + 1) * row_h)
            cur_x = start_x
            row_bg = "#F8FAFC" if (r_idx % 2 == 1) else "#FFFFFF"

            row_vals = [
                f"{start_row_num + r_idx:02d}",
                str(item.get("date", "-")),
                str(item.get("time", "-")),
                str(item.get("sender_bank", "-")),
                str(item.get("sender_name", "-")),
                f"{item.get('amount', '0.00')} บาท",
                str(item.get("receiver_name", "-")),
                str(item.get("receiver_bank", "-")),
                str(item.get("memo", "-") or "-"),
                str(item.get("filename", item.get("remarks", "-")))
            ]

            for i, (val, cw) in enumerate(zip(row_vals, col_w)):
                draw_l.rectangle([cur_x, y_top, cur_x + cw, y_top + row_h], fill=row_bg, outline="#E2E8F0")
                font_use = fonts["table_small"] if (len(val) > 22 or i == 9) else fonts["table_body"]
                disp = val if len(val) <= 18 else (val[:8] + ".." + val[-7:]) if i == 9 else val
                bbox = draw_l.textbbox((0, 0), disp, font=font_use)
                tw = bbox[2] - bbox[0]
                th = bbox[3] - bbox[1]
                tx = max(cur_x + 2, cur_x + (cw - tw) // 2)
                ty = y_top + (row_h - th) // 2
                draw_l.text((tx, ty), disp, fill="#0F172A", font=font_use)
                cur_x += cw

        # Footer Disclaimer via SSOT Theme
        apply_footer_disclaimer(
            canvas=land_canvas,
            fonts=fonts,
            is_landscape=True
        )

        rendered_pages.append(land_canvas)

    if rendered_pages:
        rendered_pages[0].save(
            out_pdf_path,
            "PDF",
            resolution=150.0,
            save_all=True,
            append_images=rendered_pages[1:]
        )
        print(f"   [OK] Generated Target PDF Dossier with Reference Standard: {out_pdf_path} ({len(rendered_pages)} pages)")
        if sample:
            png_preview = out_pdf_path.replace(".pdf", ".png")
            rendered_pages[0].save(png_preview, "PNG")
            print(f"   [OK] Generated 1-Page Real Sample Preview Image: {png_preview}")



def main():
    parser = argparse.ArgumentParser(description="Target Name Matcher & Evidence Filter Engine")
    parser.add_argument("--name", type=str, help="Full target name (e.g. 'จิณห์นิภา ประสาทเขตการ')")
    parser.add_argument("--first", type=str, help="Target first name (e.g. 'จิณห์นิภา')")
    parser.add_argument("--last", type=str, help="Target surname (e.g. 'ประสาทเขตการ')")
    parser.add_argument("--role", type=str, default="any", choices=["any", "sender", "receiver"], help="Role filter")
    parser.add_argument("--cache", type=str, default="Folder_Out/slips_ocr_cache.json", help="Path to slips OCR cache")
    parser.add_argument("--out", type=str, default="Folder_Out", help="Output directory")
    parser.add_argument("--sample", action="store_true", help="Generate exactly 1 real page sample preview")
    parser.add_argument("--all", action="store_true", help="Generate full complete dossier (all pages)")
    
    args = parser.parse_args()
    
    target_name = args.name or ""
    target_first = args.first
    target_last = args.last
    
    if not target_name and not target_first:
        print("=" * 70)
        print("🏛️ DIGITAL EVIDENCE — TARGET NAME MATCHER (สกิล Name)")
        print("   หลักการ: 'ไม่สนว่าจะมีคำนำหน้าว่าอะไร ชื่อตรง นามสกุลตรง นั้นคือถูก'")
        print("=" * 70)
        user_input = input("กรุณาระบุชื่อ-นามสกุลเป้าหมายที่ต้องการค้นหา: ").strip()
        if not user_input:
            print("❌ ยกเลิก: ไม่ได้ระบุชื่อ")
            return
        target_name = user_input
        
    # Check sample vs all prompt if not explicitly specified via CLI flag
    is_sample = args.sample
    if not args.sample and not args.all:
        if sys.stdin and sys.stdin.isatty():
            choice = input("\nต้องการสร้าง 'ตัวอย่าง (1 หน้าจริง)' หรือ 'ทั้งหมด' (sample/all) [default: sample]: ").strip().lower()
            if choice in ("all", "ท", "ทั้งหมด"):
                is_sample = False
            else:
                is_sample = True
        else:
            is_sample = False

    res = filter_slips_by_name(
        target_name=target_name,
        target_first=target_first,
        target_last=target_last,
        role=args.role,
        cache_path=args.cache,
        output_dir=args.out,
        sample=is_sample,
    )
    print("\n✅ การประมวลผลเสร็จสิ้นสมบูรณ์!")


if __name__ == "__main__":
    main()
