# -*- coding: utf-8 -*-
"""P2 จากอีกทาง (ดิบเพื่อเทส)."""
import re
import unittest
from typing import List, Tuple

AMOUNT_REGEX = re.compile(r'\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?\b')
def _qr_tag54_values(s):
    """เดิน TLV หา Tag 54 แล้วตรวจความยาว (ไม่พึ่งตัวคั่น เพราะ TLV ติดกัน)."""
    out = []
    for m in re.finditer(r"54(\d{2})", s):
        L = int(m.group(1))
        val = s[m.end():m.end() + L]
        if len(val) == L and re.fullmatch(r"\d+(?:\.\d{2})?", val):
            out.append(val)
    return out


def find_amount_candidates(text: str) -> List[Tuple[str, str]]:
    candidates: List[Tuple[str, str]] = []
    lines = text.splitlines()
    for line in lines:
        clean_line = line.strip()
        if not clean_line:
            continue
        for val in _qr_tag54_values(clean_line):
            formatted_val = f"{float(val):,.2f}"
            candidates.append((formatted_val, "QR_Tag54"))
        matches = AMOUNT_REGEX.finditer(clean_line)
        for m in matches:
            val_str = m.group(0)
            clean_num_str = val_str.replace(",", "")
            if "." not in val_str and len(clean_num_str) > 7:
                continue
            start_pos = max(0, m.start() - 25)
            context_before = clean_line[start_pos:m.start()].lower()
            label = "body_text"
            if any(k in context_before for k in ["ค่าธรรมเนียม", "fee"]):
                label = "fee"
            elif any(k in context_before for k in ["จำนวนเงิน", "ยอดเงิน", "ยอดโอน", "amount"]):
                label = "amount_label"
            elif any(k in context_before for k in ["ref", "รหัสอ้างอิง", "เลขที่"]):
                label = "ref_label"
            formatted_val = f"{float(clean_num_str):,.2f}"
            candidates.append((formatted_val, label))
    return candidates


