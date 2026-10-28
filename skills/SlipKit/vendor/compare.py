# -*- coding: utf-8 -*-
"""พอร์ตจาก Slip Mode/scripts/compare_slips.py: printed-check + สาขา + Excel (ใช้ EasyOCR แทน tesseract)."""
import os
import re

BRANCH_PAT = re.compile(r"สาขา\s*([ก-๙A-Za-z0-9().\-\s]{2,40})")


def extract_branch(text):
    m = BRANCH_PAT.search(text or "")
    return m.group(1).strip() if m else None


def load_printed_log(log_path):
    printed = set()
    if not os.path.exists(log_path):
        return printed
    with open(log_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                base = os.path.basename(line)
                printed.add(os.path.splitext(base)[0].lower())
    return printed


def is_printed(filename, printed_set):
    return os.path.splitext(os.path.basename(filename))[0].lower() in printed_set


def build_excel(rows, outpath):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "slips"
    headers = ["Filename", "Timestamp", "Amount", "Payer", "Reference", "Branch", "Printed"]
    ws.append(headers)
    for r in rows:
        ws.append([r.get("Filename", ""), r.get("Timestamp", ""), r.get("Amount", ""),
                   r.get("Payer", ""), r.get("Reference", ""), r.get("Branch", ""),
                   r.get("Printed", "")])
    wb.save(outpath)
    return outpath
