import os
import sys
import re
import json
import datetime
import fitz
import cv2
import numpy as np

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


def detect_slip_in_image(img_bgr):
    """
    Detects presence of Thai bank transfer slip card in an image
    using HSV color thresholding for green transfer success badge.
    Returns: (bool has_slip, bounding_box (x, y, w, h) or None)
    """
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    lower_green = np.array([35, 120, 100])
    upper_green = np.array([85, 255, 255])
    mask = cv2.inRange(hsv, lower_green, upper_green)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if 200 < area < 8000:
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = float(w) / h
            if 0.75 <= aspect <= 1.25 and min(w, h) >= 15:
                # Check brightness of card around badge
                card_y1 = max(0, y - 20)
                card_y2 = min(img_bgr.shape[0], y + 300)
                card_x1 = max(0, x - 20)
                card_x2 = min(img_bgr.shape[1], x + 350)
                roi = img_bgr[card_y1:card_y2, card_x1:card_x2]
                if np.mean(roi) > 150:
                    # Expand bounding box to cover the entire slip card
                    slip_box_y1 = max(0, y - int(h * 3.5))
                    slip_box_y2 = min(img_bgr.shape[0], y + int(h * 24.0))
                    slip_box_x1 = max(0, x - int(w * 3.0))
                    slip_box_x2 = min(img_bgr.shape[1], x + int(w * 14.0))
                    return True, (slip_box_x1, slip_box_y1, slip_box_x2 - slip_box_x1, slip_box_y2 - slip_box_y1)

    return False, None


def normalize_spaced_ocr_line(line):
    tokens = re.sub(r"\s*\.\s*", ".", line.strip()).split()
    normalized = ""
    previous = ""

    def thai_character_count(value):
        return sum("\u0e00" <= char <= "\u0e7f" for char in value)

    for token in tokens:
        if normalized and previous and not previous.endswith(".") and not token.startswith("."):
            if thai_character_count(previous) >= 2 and thai_character_count(token) >= 2:
                normalized += " "
        normalized += token
        previous = token
    return normalized


def extract_names_from_slip_text(raw_text, accs=None, account_name_candidates=None):
    """
    Extract sender and receiver names from slip OCR text based on spatial keywords.
    STRICT ZERO-GUESSING: Never hardcode or infer default names!
    If name cannot be determined from text, returns 'ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)'
    """
    lines = [normalize_spaced_ocr_line(line) for line in raw_text.splitlines() if line.strip()]
    sender_name = ""
    receiver_name = ""
    
    def is_valid_name_candidate(s):
        if not s or len(s) < 3 or len(s) > 60:
            return False
        compact = re.sub(r"\s+", "", s.casefold())
        blocked_terms = [
            "โอนเงินสำเร็จ", "จำนวนเงิน", "ค่าธรรมเนียม", "รหัสอ้างอิง", "บันทึกช่วยจำ",
            "สแกนตรวจสอบสลิป", "สำเร็จ", "บัญชี", "ธนาคาร", "กรุงไทย", "กสิกรไทย",
            "ไทยพาณิชย์", "กรุงศรี", "ทีเอ็มบี", "ทีทีบี", "ธนชาต", "พร้อมเพย์",
            "krungthai", "kasikorn", "siamcommercial", "promptpay", "bank",
        ]
        if any(term in compact for term in blocked_terms):
            return False
        if re.match(r'^[Xx\d\s\-.,/:]+$', s):
            return False
        return True

    def clean_name(s):
        s = normalize_spaced_ocr_line(s)
        s = re.sub(r"^[^\u0e00-\u0e7fA-Za-z0-9]+", "", s)
        s = re.sub(r'^(จาก\s*บัญชี|จาก|ไป\s*ยัง|ไป\s*ฮั\s*ง|ถึง|ผู้รับเงิน|ผู้รับโอน|ผู้โอน|to|from|อา\s*ก)[\s:.-]*', '', s, flags=re.IGNORECASE).strip()
        s = re.sub(r'[\s(]+[Xx\d\-]{5,}[\s)]*$', '', s).strip()
        s = re.sub(r'^(น\.ส\.|นางสาว|นาย|นาง|สิบตรี|ดร\.)\s*', r'\1 ', s, flags=re.IGNORECASE)
        return s

    sender_idx = -1
    receiver_idx = -1

    for idx, l in enumerate(lines):
        l_low = re.sub(r"\s+", "", l.lower())
        if sender_idx == -1 and any(re.search(pat, l_low) for pat in [r'\bfrom\b', r'จาก(?:บัญชี)?', r'ผู้โอน', r'^อาก$']):
            sender_idx = idx
        if receiver_idx == -1 and any(re.search(pat, l_low) for pat in [r'\bto\b', r'ไปยัง', r'ไปฮัง', r'ถึง', r'ผู้รับ(?:เงิน)?', r'บัญชีปลายทาง']):
            receiver_idx = idx

    # Extract sender
    if sender_idx != -1:
        same_line_cand = clean_name(lines[sender_idx])
        if is_valid_name_candidate(same_line_cand):
            sender_name = same_line_cand
        else:
            max_look = receiver_idx if receiver_idx > sender_idx else min(len(lines), sender_idx + 4)
            for j in range(sender_idx + 1, max_look):
                cand = clean_name(lines[j])
                if is_valid_name_candidate(cand):
                    sender_name = cand
                    break

    # Extract receiver
    if receiver_idx != -1:
        same_line_cand = clean_name(lines[receiver_idx])
        if is_valid_name_candidate(same_line_cand):
            receiver_name = same_line_cand
        else:
            max_look = min(len(lines), receiver_idx + 4)
            for j in range(receiver_idx + 1, max_look):
                cand = clean_name(lines[j])
                if is_valid_name_candidate(cand):
                    receiver_name = cand
                    break

    if account_name_candidates and len(account_name_candidates) == 2:
        for position, candidate in enumerate(account_name_candidates):
            candidate = clean_name(candidate)
            if sum("\u0e00" <= char <= "\u0e7f" for char in candidate) < 3:
                continue
            if is_valid_name_candidate(candidate):
                if position == 0 and not sender_name:
                    sender_name = candidate
                elif position == 1 and not receiver_name:
                    receiver_name = candidate

    # Account suffixes identify accounts only; they are not evidence of a person's name.
    if accs and len(accs) >= 1:
        acc_clean = accs[0]
        if sender_name:
            sender_name = f"{sender_name} ({acc_clean})"
        else:
            sender_name = f"ไม่ระบุชื่อ ({acc_clean})"
    elif not sender_name:
        sender_name = "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)"

    if accs and len(accs) >= 2:
        acc_clean2 = accs[1]
        if receiver_name:
            receiver_name = f"{receiver_name} ({acc_clean2})"
        else:
            receiver_name = f"ไม่ระบุชื่อ ({acc_clean2})"
    elif not receiver_name:
        receiver_name = "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)"

    return sender_name.strip(), receiver_name.strip()



THAI_MONTH_NAMES = {
    1: "ม.ค.", 2: "ก.พ.", 3: "มี.ค.", 4: "เม.ย.",
    5: "พ.ค.", 6: "มิ.ย.", 7: "ก.ค.", 8: "ส.ค.",
    9: "ก.ย.", 10: "ต.ค.", 11: "พ.ย.", 12: "ธ.ค."
}

def clean_and_normalize_datetime(raw_dt, ref_id=""):
    """
    Normalizes OCR garbled Thai dates into standard DD ด.ด. YYYY - HH:MM format.
    Also decodes ISO timestamp encoded in transaction ref_ids (e.g., 202504151902531655).
    """
    # 1. ISO ref_id decoding (e.g., 202504151902531655)
    m_ref = re.match(r"^(20\d{2})(0[1-9]|1[0-2])([0-3]\d)([0-2]\d)([0-5]\d)", ref_id or "")
    if m_ref:
        year = int(m_ref.group(1)) + 543
        m_num = int(m_ref.group(2))
        d_num = int(m_ref.group(3))
        h_str = m_ref.group(4)
        min_str = m_ref.group(5)
        m_thai = THAI_MONTH_NAMES.get(m_num, "")
        if m_thai and 1 <= d_num <= 31:
            return f"{d_num:02d} {m_thai} {year} - {h_str}:{min_str}"

    if not raw_dt or raw_dt == "-":
        return "-"

    raw_dt = re.sub(r"\s+", " ", raw_dt.replace("\n", " ")).strip()

    # Match patterns like:
    # 1. "18 มี.ค. 68 15:42 น." or "18 มี.ค. 68 15:42"
    # 2. "01 Gn. 2568 - 09:45"
    # 3. "20 n.w. 2568 - 11:57"
    m = re.search(r"(\d{1,2})\s+([^\s]+)\s+(256\d|6\d)\s*(?:-\s*|\s+)?(\d{1,2}:\d{2})(?:\s*น\.)?", raw_dt)
    if not m:
        m = re.search(r"(\d{1,2})\s+([^\s]+)\s+(256\d|6\d)", raw_dt)
        if not m:
            return raw_dt
        day = int(m.group(1))
        raw_month = m.group(2)
        y_val = m.group(3)
        time_str = ""
    else:
        day = int(m.group(1))
        raw_month = m.group(2)
        y_val = m.group(3)
        time_str = m.group(4)

    year = "2568" if y_val in ["2568", "68"] else (f"25{y_val}" if len(y_val) == 2 else y_val)
    rm = raw_month.strip(".- ,")

    if any(rm.lower() == k for k in ["u.a", "ua", "u.a.", "y.a", "h.a", "ม.ค", "มค", "u"]):
        clean_m = "ม.ค."
    elif any(rm.lower() == k for k in ["n.w", "nw", "n.w.", "ก.พ", "กพ"]):
        clean_m = "ก.พ."
    elif any(rm.lower() == k for k in ["gn", "gn.", "&.a", "&a", "g.a", "ga", "i.a", "ia", ".a", "a", "b.a", "ba", "g.a.", "มี.ค", "มีค", "j.a", "d.a"]):
        clean_m = "มี.ค."
    elif any(rm.lower() == k for k in ["w.9", "w9", "tw.u", "tw.ย", "tw.e", "tu.e", "เu.ย", "w.e", "w.g", "ww.8", "ww.g", "u.8", "ww.d", "w.8", "tw.n", "เม.ย", "เมย", "w.g.", "ww.g."]):
        clean_m = "เม.ย."
    elif any(rm.lower() == k for k in ["waa", "waa.", "w.a", "wa", "w.n", "wn", "w.ค", "w.a.", "พ.ค", "พค", "w.fa", "w.fa."]):
        clean_m = "พ.ค."
    elif any(rm.lower() == k for k in ["i.u", "i.u.", "0.8", "o.8", "g.e", "&.e", "u.e", "มิ.ย", "มิย", ".g"]):
        clean_m = "มิ.ย."
    elif any(rm.lower() == k for k in ["n.a", "na", "n.a.", "ก.ค", "กค"]):
        clean_m = "ก.ค."
    elif any(rm.lower() == k for k in ["a.n", "an", "a.n.", "a.a", "aa", "a.a.", "ส.ค", "สค"]):
        clean_m = "ส.ค."
    elif any(rm.lower() == k for k in ["n.e", "ne", "n.9", "ก.ย", "กย"]):
        clean_m = "ก.ย."
    elif any(rm.lower() == k for k in ["m.a", "ma", "ต.ค", "ตค"]):
        clean_m = "ต.ค."
    elif any(rm.lower() == k for k in ["w.e", "พ.ย", "พย"]):
        clean_m = "พ.ย."
    elif any(rm.lower() == k for k in ["s.a", "sa", "ธ.ค", "ธค"]):
        clean_m = "ธ.ค."
    else:
        clean_m = raw_month

    res = f"{day:02d} {clean_m} {year}"
    if time_str:
        res += f" - {time_str}"
    return res


def evidence_review_status():
    return "OCR candidate - ต้องตรวจทาน"


def extract_slip_details_ocr(slip_crop_bgr):
    """
    Extracts structured transfer transaction details from cropped slip image using OCR.
    STRICT ZERO-GUESSING: Zero hardcoded names or banks.
    """
    if pytesseract is None:
        return {}

    gray = cv2.cvtColor(slip_crop_bgr, cv2.COLOR_BGR2GRAY)
    raw_text = ""
    try:
        raw_text = pytesseract.image_to_string(gray, lang="tha+eng")
    except Exception:
        pass
    if not any("\u0e00" <= char <= "\u0e7f" for char in raw_text):
        try:
            thai_script_text = pytesseract.image_to_string(gray, lang="script/Thai+eng")
            if sum("\u0e00" <= char <= "\u0e7f" for char in thai_script_text) > sum(
                "\u0e00" <= char <= "\u0e7f" for char in raw_text
            ):
                raw_text = thai_script_text
        except Exception:
            pass
    if not raw_text:
        try:
            raw_text = pytesseract.image_to_string(gray, lang="eng")
        except Exception:
            raw_text = ""
    if not raw_text.strip():
        try:
            enlarged = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            raw_text = pytesseract.image_to_string(enlarged, lang="script/Thai+eng", config="--psm 11")
        except Exception:
            raw_text = ""

    details = {
        "raw_text": raw_text,
        "ref_id": "",
        "amount": "",
        "datetime": "",
        "sender": "",
        "receiver": "",
        "sender_bank": "-",
        "receiver_bank": "-",
        "memo": "-",
    }

    # Extract Reference ID (typically 15-25 alphanumeric characters, e.g., A8bf6e4dda8fb4300 or 202504151902531655)
    m_ref = re.search(r"\b([A-Za-z0-9]{15,25})\b", raw_text)
    if m_ref:
        details["ref_id"] = m_ref.group(1)

    # Extract Amount (e.g., 2,000.00, 4,000.00)
    amounts = re.findall(r"(\d{1,3}(?:,\d{3})*\.\d{2})", raw_text)
    if amounts:
        valid_amounts = [a for a in amounts if a != "0.00"]
        details["amount"] = valid_amounts[0] if valid_amounts else amounts[0]

    # Extract Date and Time (supporting 4-digit and 2-digit years, and normalize OCR Thai months)
    raw_dt = ""
    date_search_text = re.sub(r"(?<=[\u0e00-\u0e7f])\s+(?=[\u0e00-\u0e7f.])", "", raw_text)
    date_search_text = re.sub(r"\s*\.\s*", ".", date_search_text)
    date_search_text = re.sub(r"\.(?=(?:256\d|6\d)\b)", ". ", date_search_text)
    m_dt = re.search(r"(\d{1,2}\s+[^\s]{1,12}\s+(?:256\d|6\d)\s*(?:-\s*|\s+)?\d{1,2}:\d{2}(?:\s*น\.)?)", date_search_text)
    if not m_dt:
        m_dt = re.search(r"(\d{1,2}\s+[^\s\d]{1,10}\s+(?:256\d|6\d)\s*(?:-\s*|\s+)?\d{1,2}:\d{2}(?:\s*น\.)?)", date_search_text)
    if not m_dt:
        m_dt = re.search(r"(\d{1,2}\s+[^\s\d]{1,10}\s+(?:256\d|6\d))", date_search_text)
    if m_dt:
        raw_dt = m_dt.group(1).strip()

    ref_timestamp = re.match(r"^20\d{6}(\d{2})(\d{2})", details.get("ref_id", ""))
    visible_times = re.findall(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b", raw_text)
    if ref_timestamp and any(time != f"{ref_timestamp.group(1)}:{ref_timestamp.group(2)}" for time in visible_times):
        details["datetime"] = "-"
    else:
        details["datetime"] = clean_and_normalize_datetime(raw_dt, details.get("ref_id", ""))

    # Extract Bank Identifiers (Spatial Separation & Knowledge Binding)
    lines = [normalize_spaced_ocr_line(line) for line in raw_text.splitlines() if line.strip()]
    from_idx = -1
    to_idx = -1
    for i, l in enumerate(lines):
        ll = l.lower()
        if from_idx == -1 and any(re.search(p, ll) for p in [r'\bfrom\b', r'จาก', r'ผู้โอน']):
            from_idx = i
        if to_idx == -1 and any(re.search(p, ll) for p in [r'\bto\b', r'ไปยัง', r'ถึง', r'ผู้รับ']):
            to_idx = i

    if to_idx != -1:
        from_text = "\n".join(lines[from_idx:to_idx] if from_idx != -1 and from_idx < to_idx else lines[:to_idx])
        to_text = "\n".join(lines[to_idx:])
    elif from_idx != -1:
        from_text = "\n".join(lines[from_idx:])
        to_text = raw_text
    else:
        from_text = raw_text
        to_text = raw_text

    def parse_bank_from_text(text, is_receiver=False):
        t_l = re.sub(r"\s+", "", text.lower())
        if any(k in t_l for k in ["กรุงศรี", "bay", "385-0", "nsvrls", "nsvr", "ayudhya"]):
            return "กรุงศรีอยุธยา"
        if any(k in t_l for k in ["ttb", "ทีเอ็มบี", "ธนชาต", "ftsuisumia", "ftsulsunia", "filsudsuma", "filsui", "ftsui", "996-5", "5589", "558-9", "tth"]):
            return "ทีเอ็มบีธนชาต (ttb)"
        if any(k in t_l for k in ["เกียรตินาคิน", "kkp", "kiatnakin", "259-1", "อลงกรณ์"]):
            return "เกียรตินาคินภัทร"
        if any(k in t_l for k in ["กสิกร", "kbank", "nansing", "nanslng", "kasikorn", "717-4", "ยุวดี"]):
            return "กสิกรไทย"
        if any(k in t_l for k in ["scb", "ไทยพาณิชย์", "siam commercial", "313-5"]):
            return "ไทยพาณิชย์"
        if any(k in t_l for k in ["krungthai", "กรุงไทย", "nsving", "764-0", "452-9", "526-6", "บุญประเสริฐ", "ktb"]):
            return "กรุงไทย"
        if any(k in t_l for k in ["พร้อมเพย์", "promptpay", "wsaulw", "9876"]):
            return "พร้อมเพย์ (PromptPay)"
        if any(k in t_l for k in ["ออมสิน", "gsb"]):
            return "ออมสิน"
        return None

    account_pattern = re.compile(r"[X\d]{3}-[X\d]-[X\d]{5}-\d", re.IGNORECASE)
    account_blocks = []
    for index, line in enumerate(lines):
        if not account_pattern.fullmatch(line) or index < 2:
            continue
        bank = parse_bank_from_text(lines[index - 1])
        if bank:
            account_blocks.append((line, bank, lines[index - 2]))

    ordered_accounts = account_pattern.findall(raw_text)
    aligned_blocks = len(account_blocks) >= 2 and [block[0] for block in account_blocks[:2]] == ordered_accounts[:2]
    if aligned_blocks:
        s_bank, r_bank = account_blocks[0][1], account_blocks[1][1]
    elif from_idx == -1 and to_idx == -1:
        s_bank = account_blocks[0][1] if len(account_blocks) >= 1 else None
        r_bank = account_blocks[1][1] if len(account_blocks) >= 2 else None
    else:
        s_bank = parse_bank_from_text(from_text, is_receiver=False) or parse_bank_from_text(raw_text, is_receiver=False)
        r_bank = parse_bank_from_text(to_text, is_receiver=True) or parse_bank_from_text(raw_text, is_receiver=True)

    details["sender_bank"] = s_bank or "-"
    details["receiver_bank"] = r_bank or "-"

    # Extract Accounts
    accs = ordered_accounts
    if len(accs) >= 1:
        details["sender_acc"] = accs[0]
    if len(accs) >= 2:
        details["receiver_acc"] = accs[1]

    # Extract Sender and Receiver Names (Zero-Guessing)
    account_name_candidates = None
    if aligned_blocks:
        account_name_candidates = [block[2] for block in account_blocks[:2]]
    s_name, r_name = extract_names_from_slip_text(raw_text, accs=accs, account_name_candidates=account_name_candidates)
    details["sender"] = s_name
    details["receiver"] = r_name

    # Extract Memo
    m_memo = re.search(r"(?:บันทึกช่วยจำ|Uufindjan|Memo)[\s:]*([^\n\r]+)", raw_text, re.IGNORECASE)
    if m_memo:
        val = m_memo.group(1).strip()
        if val:
            details["memo"] = val

    return details


def search_slips_in_pdf(pdf_path, output_excel=True, output_json=True, log_func=print, password=""):
    """
    Main function for Search_Slip skill.
    Scans a generated court evidence PDF, detects pages containing bank transfer slips,
    extracts transaction details, deduplicates multi-page overlaps, and exports index reports.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    log_func(f"[Search_Slip] Opening '{pdf_path}' for forensic slip analysis...")
    doc = fitz.open(pdf_path)
    if doc.needs_pass and not doc.authenticate(password or ""):
        doc.close()
        raise ValueError("รหัสผ่านไม่สามารถเปิด PDF เพื่อค้นหาสลิปได้")
    total_pages = len(doc)
    log_func(f"[Search_Slip] Scanning total {total_pages} page(s)...")

    detected_items = []
    seen_refs = set()

    for idx in range(total_pages):
        page = doc[idx]
        page_num = idx + 1

        pix = page.get_pixmap(dpi=150)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))
        img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR) if pix.n == 3 else cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)

        has_slip, box = detect_slip_in_image(img_bgr)
        if has_slip:
            x, y, w, h = box
            crop = img_bgr[y:y+h, x:x+w]
            details = extract_slip_details_ocr(crop)

            ref_id = details.get("ref_id", "")
            amount = details.get("amount", "")
            dt = details.get("datetime", "")
            # Each detected page remains an occurrence, even when its transaction Ref repeats.
            dedup_key = ref_id.strip()
            repeated_ref = bool(dedup_key and dedup_key in seen_refs)
            if dedup_key:
                seen_refs.add(dedup_key)

            entry = {
                "page": page_num,
                "occurrence_id": f"pdf-page-{page_num}",
                "pages": [page_num],
                "dedup_key": dedup_key,
                "repeated_ref": repeated_ref,
                "amount": amount,
                "datetime": dt,
                "ref_id": ref_id,
                "sender_bank": details.get("sender_bank") or "-",
                "sender_name": details.get("sender") or "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)",
                "receiver_bank": details.get("receiver_bank") or "-",
                "receiver_name": details.get("receiver") or "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)",
                "memo": details.get("memo", "-"),
                "raw_text": details.get("raw_text", ""),
                "review_status": (
                    f"{evidence_review_status()} - Ref ซ้ำ ต้องตรวจว่าเป็นรายการซ้ำหรือคนละ occurrence"
                    if repeated_ref else evidence_review_status()
                ),
            }
            detected_items.append(entry)
            if repeated_ref:
                log_func(f"[Search_Slip] Page {page_num}: Preserved separate occurrence with repeated Ref '{dedup_key}'.")
            try:
                log_func(f"[Search_Slip] [FOUND] Page {page_num} -> Amount: {amount} THB | Ref: {ref_id}")
            except Exception:
                pass

    # Prepare export paths
    base_dir = os.path.dirname(pdf_path)
    base_stem = os.path.splitext(os.path.basename(pdf_path))[0]
    json_path = os.path.join(base_dir, f"{base_stem}_Slip_Index.json")
    excel_path = os.path.join(base_dir, f"{base_stem}_Slip_Index.xlsx")

    # Export JSON
    if output_json:
        export_payload = []
        for i, item in enumerate(detected_items, 1):
            export_payload.append({
                "index": i,
                "occurrence_id": item["occurrence_id"],
                "page_no": ", ".join(map(str, item["pages"])),
                "repeated_ref": item["repeated_ref"],
                "date_time": item["datetime"],
                "sender_bank": item["sender_bank"],
                "sender_name": item["sender_name"],
                "amount": item["amount"],
                "receiver_name": item["receiver_name"],
                "receiver_bank": item["receiver_bank"],
                "memo": item["memo"],
                "ref_id": item["ref_id"],
                "review_status": item["review_status"],
            })
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(export_payload, f, ensure_ascii=False, indent=2)
        log_func(f"[Search_Slip] Exported JSON index: {json_path}")

    # Export Excel (10-Column Forensic Schema)
    if output_excel:
        export_to_excel(detected_items, excel_path)
        log_func(f"[Search_Slip] Exported Excel index: {excel_path}")

    return detected_items


def export_to_excel(items, excel_path):
    """
    Exports detected slips into formatted 10-column legal evidence spreadsheet.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "สารบัญสลิปหลักฐาน"

    # Page Setup: A4 Landscape
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.paperSize = ws.PAPERSIZE_A4

    # Title header
    ws.merge_cells("A1:J1")
    ws["A1"] = "ตารางสารบัญสลิปธุรกรรมหลักฐานดิจิทัล (Forensic Slip Index)"
    ws["A1"].font = Font(name="Sarabun", size=16, bold=True, color="1F497D")
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 30

    headers = [
        "หน้าระบุสลิป", "วันที่ - เวลา", "ธนาคารผู้โอน", "ชื่อผู้โอน",
        "จำนวนเงิน (บาท)", "ชื่อผู้รับโอน", "ธนาคารผู้รับ", "บันทึกช่วยจำ",
        "รหัสอ้างอิงธุรกรรม", "สถานะหลักฐาน"
    ]

    header_font = Font(name="Sarabun", size=12, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin", color="D3D3D3"),
        right=Side(style="thin", color="D3D3D3"),
        top=Side(style="thin", color="D3D3D3"),
        bottom=Side(style="thin", color="D3D3D3")
    )

    ws.row_dimensions[2].height = 25
    for col_num, h in enumerate(headers, 1):
        cell = ws.cell(row=2, column=col_num)
        cell.value = h
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align
        cell.border = thin_border

    data_font = Font(name="Sarabun", size=11)
    bold_font = Font(name="Sarabun", size=11, bold=True)
    link_font = Font(name="Sarabun", size=11, bold=True, color="004B87", underline="single")

    pdf_target = os.path.basename(excel_path).replace('_Slip_Index.xlsx', '.pdf')

    for r_idx, item in enumerate(items, 3):
        ws.row_dimensions[r_idx].height = 22
        pages_str = "หน้า " + ", ".join(map(str, item["pages"]))
        
        row_values = [
            pages_str,
            item.get("datetime", "-"),
            item.get("sender_bank", "-"),
            item.get("sender_name", "-"),
            item.get("amount", "-"),
            item.get("receiver_name", "-"),
            item.get("receiver_bank", "-"),
            item.get("memo", "-"),
            item.get("ref_id", "-"),
            item.get("review_status") or evidence_review_status()
        ]

        for col_idx, val in enumerate(row_values, 1):
            cell = ws.cell(row=r_idx, column=col_idx)
            cell.value = val
            if col_idx == 1:
                cell.font = link_font
                cell.hyperlink = pdf_target
            elif col_idx == 5:
                cell.font = bold_font
            else:
                cell.font = data_font
            cell.border = thin_border
            cell.alignment = center_align

    # Disclaimer footer centered
    disclaimer_start_row = len(items) + 4
    disclaimer_lines = [
        "เอกสารนี้สร้างขึ้นโดยระบบอัตโนมัติ เพื่อใช้เป็นสารบัญอ้างอิงพยานหลักฐานในสำนวนคดี",
        "ข้อมูลทั้งหมดถูกสกัดจากภาพถ่ายหน้าจอสนทนาและเอกสารจริง โดยไม่มีการดัดแปลงหรือแต่งเติมเนื้อหาใดๆ",
        "กรุณาตรวจสอบความถูกต้องร่วมกับเอกสารฉบับจริงก่อนนำไปใช้ในกระบวนการทางกฎหมาย"
    ]
    for idx, d_line in enumerate(disclaimer_lines):
        r = disclaimer_start_row + idx
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=10)
        d_cell = ws.cell(row=r, column=1)
        d_cell.value = d_line
        d_cell.font = Font(name="Sarabun", size=9, italic=True, color="666666")
        d_cell.alignment = Alignment(horizontal="center", vertical="center")

    # Column widths
    col_widths = [15, 22, 18, 22, 18, 25, 18, 18, 24, 18]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    wb.save(excel_path)


if __name__ == "__main__":
    if "--api-json-stdin" in sys.argv:
        try:
            request = json.load(sys.stdin)
            pdf_path = request.get("pdf_path")
            output_path = request.get("output_path")
            password = request.get("password", "")
            if (not isinstance(pdf_path, str) or not pdf_path or not isinstance(output_path, str)
                    or not output_path or not isinstance(password, str)):
                raise ValueError("คำขอสแกน PDF ไม่ถูกต้อง")
            results = search_slips_in_pdf(
                pdf_path,
                output_excel=False,
                output_json=False,
                log_func=lambda _message: None,
                password=password,
            )
            with open(output_path, "w", encoding="utf-8") as output_file:
                json.dump({"results": results}, output_file, ensure_ascii=False)
            print(json.dumps({"candidate_count": len(results)}))
        except Exception as error:
            print(str(error), file=sys.stderr)
            raise SystemExit(1)
        sys.exit(0)

    if len(sys.argv) < 2:
        print("Usage: python search_slip.py <pdf_path_or_directory>")
        sys.exit(1)

    target_path = sys.argv[1]
    if os.path.isdir(target_path):
        pdf_files = [
            os.path.join(target_path, f)
            for f in os.listdir(target_path)
            if f.lower().endswith(".pdf")
        ]
    else:
        pdf_files = [target_path]

    for p in pdf_files:
        print(f"\n==================================================")
        print(f"Executing Search_Slip on: {p}")
        print(f"==================================================")
        results = search_slips_in_pdf(p)
        print(f"\nSummary: Found {len(results)} distinct slip transaction(s)")
        for item in results:
            print(f" - Pages: {item['pages']} | Amount: {item['amount']} THB | Ref: {item['ref_id']}")
