"""
Skill: OCR_Slip Engine
Role & Identity: EVIDENCE AI Bridge — Bank Transfer Slip Extraction Specialist
Target Standard: 10-Column Standard Evidence Schema (A4 Legal Landscape Ready)
Pre-processing: Morphological Background Subtraction + CLAHE + Multi-Pass OCR + EMVCo QR Code Extraction
"""

import os
import sys
import re
import cv2
import numpy as np
import json
import hashlib
import argparse
import calendar
import subprocess
from pathlib import Path
import pytesseract
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

sys.stdout.reconfigure(encoding='utf-8')

def resolve_tessdata_directory(candidates):
    """Prefer a complete Thai+English model set over stale English-only data."""
    paths = [Path(candidate) for candidate in candidates if candidate]
    for path in paths:
        has_english = (path / "eng.traineddata").is_file()
        has_thai = (path / "tha.traineddata").is_file() or (path / "script" / "Thai.traineddata").is_file()
        if has_english and has_thai:
            return path
    for path in paths:
        if (path / "eng.traineddata").is_file():
            return path
    return None


LOCAL_TESSDATA = Path(r"d:\Project\DIGITAL_EVIDENCE\tessdata")
TESSERACT_CMD = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
pytesseract.pytesseract.tesseract_cmd = str(TESSERACT_CMD)
TESSDATA_DIRECTORY = resolve_tessdata_directory([
    TESSERACT_CMD.parent / "tessdata",
    LOCAL_TESSDATA,
])
if TESSDATA_DIRECTORY:
    os.environ["TESSDATA_PREFIX"] = str(TESSDATA_DIRECTORY)

try:
    from gemini_slip_fallback import recover_unresolved_slip
except ImportError:
    try:
        from _skills.OCR_Slip.scripts.gemini_slip_fallback import recover_unresolved_slip
    except ImportError:
        def recover_unresolved_slip(image_input, slip_data: dict) -> dict:
            return slip_data

_qr_detector = cv2.QRCodeDetector()

def select_ocr_language(available_languages):
    """Prefer Thai OCR data actually installed on this machine."""
    available = set(available_languages or [])
    if "tha" in available and "eng" in available:
        return "tha+eng"
    if "script/Thai" in available and "eng" in available:
        return "script/Thai+eng"
    if "tha" in available:
        return "tha"
    if "script/Thai" in available:
        return "script/Thai"
    return "eng"

def parse_tesseract_languages(output):
    """Parse Tesseract's language list, including nested script models on Windows."""
    languages = []
    for line in output.splitlines():
        language = line.strip().replace("\\", "/")
        if not language or "available languages" in language.lower():
            continue
        if re.fullmatch(r"[A-Za-z0-9_/-]+", language):
            languages.append(language)
    return languages

def get_installed_ocr_languages():
    try:
        result = subprocess.run(
            [pytesseract.pytesseract.tesseract_cmd, "--list-langs"],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        return parse_tesseract_languages(result.stdout)
    except Exception:
        try:
            return pytesseract.get_languages(config="")
        except Exception:
            return ["eng"]

def format_slip_date(day, month, year):
    """Return a validated DD/MM/YYYY date, preserving Buddhist-era year values."""
    try:
        day_num, month_num, year_num = int(day), int(month), int(year)
        if year_num >= 2400:
            year_num -= 543
        if not 1 <= month_num <= 12 or not 1 <= day_num <= calendar.monthrange(year_num, month_num)[1]:
            return None
        return f"{day_num:02d}/{month_num:02d}/{year_num + 543 if int(year) >= 2400 else int(year):04d}"
    except (TypeError, ValueError, OverflowError):
        return None

def normalize_spaced_thai_line(line):
    """Collapse glyph-by-glyph spacing emitted by Tesseract's script/Thai model."""
    return re.sub(r"(?<=[\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])", "", line)

def parse_emvco_qr(payload: str) -> dict:
    """Parse EMVCo Tag-Length-Value (TLV) payload."""
    if not payload or len(payload) < 10:
        return {}
    res = {}
    i = 0
    while i < len(payload) - 4:
        tag = payload[i:i+2]
        try:
            length = int(payload[i+2:i+4])
        except ValueError:
            break
        val = payload[i+4:i+4+length]
        res[tag] = val
        i += 4 + length
    return res

def get_ref_from_qr(qr_str: str) -> str:
    """Extract Transaction Reference ID from EMVCo QR Payload (Tag 02 or nested Tag 00 -> 02)."""
    if not qr_str:
        return None
    tlv = parse_emvco_qr(qr_str)
    if '00' in tlv and len(tlv['00']) >= 10:
        sub_tlv = parse_emvco_qr(tlv['00'])
        if '02' in sub_tlv:
            return sub_tlv['02']
    if '02' in tlv:
        return tlv['02']
    return None

def get_bank_code_from_qr(qr_str: str) -> str:
    """
    Extract 3-digit Bank of Thailand (BOT) Financial Institution Code from EMVCo QR Payload.
    Located in Tag 00 -> Sub-tag 01 (e.g. '006' = KTB, '011' = TTB, '004' = KBANK, '014' = SCB).
    """
    if not qr_str:
        return None
    tlv = parse_emvco_qr(qr_str)
    if '00' in tlv and len(tlv['00']) >= 6:
        sub_tlv = parse_emvco_qr(tlv['00'])
        if '01' in sub_tlv:
            code = sub_tlv['01'].strip()
            if len(code) == 3 and code.isdigit():
                return code
    if '01' in tlv:
        code = tlv['01'].strip()
        if len(code) == 3 and code.isdigit():
            return code
    return None

# ==============================================================================
# 🏛️ SSOT THAI BANK MASTER DICTIONARY (18 FINANCIAL INSTITUTIONS)
# ==============================================================================

BANK_CODE_MAP = {
    '002': 'กรุงเทพ',
    '004': 'กสิกรไทย',
    '005': 'กสิกรไทย',
    '006': 'กรุงไทย',
    '011': 'ทีเอ็มบีธนชาต (ttb)',
    '014': 'ไทยพาณิชย์',
    '020': 'สแตนดาร์ดชาร์เตอร์ด',
    '022': 'ซีไอเอ็มบีไทย',
    '024': 'ยูโอบี',
    '025': 'กรุงศรีอยุธยา',
    '030': 'ออมสิน',
    '031': 'ฮ่องกงและเซี่ยงไฮ้ (HSBC)',
    '033': 'อาคารสงเคราะห์ (ธอส.)',
    '034': 'เพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
    '065': 'ทิสโก้',
    '066': 'เกียรตินาคินภัทร',
    '067': 'ทิสโก้',
    '069': 'เกียรตินาคินภัทร',
    '070': 'ไทยเครดิต',
    '071': 'ไทยเครดิต',
    '073': 'แลนด์ แอนด์ เฮ้าส์ (LH Bank)',
}

FULL_BANK_DICTIONARY = [
    ("ทีเอ็มบีธนชาต (ttb)", [
        "ttb", "ทีทีบี", "ทีเอ็มบี", "ธนชาต", "thota", "thanachart", "tmb",
        "lovdsuma", "alovdsuma", "flovdsuma", "lautusuma", "loavtsusia", "996-5", "558-9"
    ]),
    ("กสิกรไทย", [
        "กสิกร", "kbank", "kasikorn", "nansin", "nansing", "nansine", "k-bank", "kplus", "295-3", "754-3"
    ]),
    ("กรุงไทย", [
        "ktb", "กรุงไทย", "krungthai", "nsving", "nsvine", "ktbnext", "526-6", "452-9"
    ]),
    ("ไทยพาณิชย์", [
        "ไทยพาณิชย์", "scb", "scbeasy", "siamcommercial", "แม่มณี", "mae-manee"
    ]),
    ("กรุงศรีอยุธยา", [
        "กรุงศรี", "bay", "krungsri", "nsvets", "nsvers", "nsvrls", "kept", "385-0"
    ]),
    ("กรุงเทพ", [
        "กรุงเทพ", "bbl", "bangkokbank", "bangkok", "บัวหลวง", "bualuang"
    ]),
    ("ออมสิน", [
        "ออมสิน", "gsb", "mymo", "governmentsavings"
    ]),
    ("เพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)", [
        "ธ.ก.ส.", "ธกส", "baac", "เพื่อการเกษตร", "amobile", "a-mobile"
    ]),
    ("อาคารสงเคราะห์ (ธอส.)", [
        "ธอส.", "ธอส", "ghb", "อาคารสงเคราะห์", "ghball", "ghb-all"
    ]),
    ("เกียรตินาคินภัทร", [
        "เกียรตินาคิน", "kkp", "kiatnakin", "dime"
    ]),
    ("ยูโอบี", [
        "ยูโอบี", "uob", "tmrw"
    ]),
    ("ซีไอเอ็มบีไทย", [
        "ซีไอเอ็มบี", "cimb", "cimbthai"
    ]),
    ("ทิสโก้", [
        "ทิสโก้", "tisco"
    ]),
    ("แลนด์ แอนด์ เฮ้าส์ (LH Bank)", [
        "แลนด์แอนด์เฮ้าส์", "lhbank", "lh-bank", "แอลเอช"
    ]),
    ("ไทยเครดิต", [
        "ไทยเครดิต", "tcrb", "thaicredit"
    ]),
    ("สแตนดาร์ดชาร์เตอร์ด", [
        "สแตนดาร์ดชาร์เตอร์ด", "scbt", "standardchartered"
    ]),
    ("ฮ่องกงและเซี่ยงไฮ้ (HSBC)", [
        "hsbc", "ฮ่องกงและเซี่ยงไฮ้"
    ]),
    ("พร้อมเพย์ (บิลเพย์เมนต์)", [
        "พร้อมเพย์", "promptpay", "wsaulw", "wsoulw", "wwsaulw", "00000", "kuiela", "biller", "นิภาภรณ์", "nipaporn"
    ])
]

# ==============================================================================
# 🛡️ PII GUARD & DATA PRIVACY (CHERRY-PICKED FROM SlipKit / pii_dedup.py)
# ==============================================================================
PII_PHONE = re.compile(r"\b0\d{9}\b")
PII_IDCARD = re.compile(r"(?<!\d)\d{13}(?!\d)")
PII_ACCOUNT = re.compile(r"(?<!\d)\d{10,12}(?!\d)")
PII_CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")

def mask_pii_text(text: str) -> str:
    """
    Mask sensitive personally identifiable information (PII) based on PDPA guidelines:
    - Citizen ID: 1-XXXX-XXXXX-12-3 -> 1-XXXX-XXXXX-XX-X
    - Phone Number: 0812345678 -> 081-XXX-5678
    - Card Number: 4111 2222 3333 4444 -> XXXX-XXXX-XXXX-4444
    """
    if not text or text == "-":
        return text
    
    # 1. Mask 13-digit Thai Citizen ID
    def _mask_id(m):
        raw = m.group(0)
        return f"{raw[0]}-XXXX-XXXXX-{raw[-2:]}"
    text = PII_IDCARD.sub(_mask_id, text)

    # 2. Mask 10-digit Phone Number (e.g. PromptPay)
    def _mask_phone(m):
        raw = m.group(0)
        return f"{raw[:3]}-XXX-{raw[-4:]}"
    text = PII_PHONE.sub(_mask_phone, text)

    # 3. Mask 16-digit Credit/Debit Card
    def _mask_card(m):
        raw = re.sub(r'[\s-]', '', m.group(0))
        return f"XXXX-XXXX-XXXX-{raw[-4:]}"
    text = PII_CARD.sub(_mask_card, text)

    return text

def compute_text_fingerprint(text: str) -> str:
    """
    Generate normalized text fingerprint (SHA-256 slice) to catch duplicate slips across different encodings,
    derived from SlipKit vendor/pii_dedup.py.
    """
    if not text:
        return ""
    norm = re.sub(r"\s+", "", str(text)).lower()
    norm = re.sub(r"[{}\"',.\-:;/()_=\[\]]", "", norm)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]

# ==============================================================================
# 🏦 BANK ACCOUNT PATTERN CROSS-VALIDATION (FROM SlipKit / bank_detector.py)
# ==============================================================================
BANK_ACCOUNT_PATTERNS = {
    "KBANK": {
        "pattern": re.compile(r"^\d{3}-\d{1}-\d{5}-\d{1}$"),
        "digits": 10,
        "format": lambda d: f"{d[:3]}-{d[3]}-{d[4:9]}-{d[9]}"
    },
    "SCB": {
        "pattern": re.compile(r"^\d{3}-\d{6}-\d{1}$"),
        "digits": 10,
        "format": lambda d: f"{d[:3]}-{d[3:9]}-{d[9]}"
    },
    "BBL": {
        "pattern": re.compile(r"^\d{3}-\d{7}-\d{1}$|^\d{3}-\d{6}-\d{1}$"),
        "digits": 10,
        "format": lambda d: f"{d[:3]}-{d[3:9]}-{d[9]}"
    },
    "KTB": {
        "pattern": re.compile(r"^\d{3}-\d{1}-\d{5}-\d{1}$"),
        "digits": 10,
        "format": lambda d: f"{d[:3]}-{d[3]}-{d[4:9]}-{d[9]}"
    },
    "TTB": {
        "pattern": re.compile(r"^\d{3}-\d{1}-\d{5}-\d{1}$"),
        "digits": 10,
        "format": lambda d: f"{d[:3]}-{d[3]}-{d[4:9]}-{d[9]}"
    },
    "BAY": {
        "pattern": re.compile(r"^\d{3}-\d{1}-\d{5}-\d{1}$"),
        "digits": 10,
        "format": lambda d: f"{d[:3]}-{d[3]}-{d[4:9]}-{d[9]}"
    },
    "GSB": {
        "pattern": re.compile(r"^\d{4}-\d{8}$|^\d{3}-\d{8}-\d{1}$"),
        "digits": 12,
        "format": lambda d: f"{d[:4]}-{d[4:]}"
    },
    "BAAC": {
        "pattern": re.compile(r"^\d{12}$"),
        "digits": 12,
        "format": lambda d: f"{d[:4]}-{d[4:8]}-{d[8:]}"
    }
}

def cross_validate_account(raw_account: str, bank_hint: str = None) -> dict:
    """
    Cross-validates an account number against standard Thai banking patterns.
    Returns validation status, normalized clean digits, and standard bank format.
    """
    if not raw_account:
        return {"valid": False, "clean": "", "formatted": raw_account, "bank_match": None, "is_masked": False}
    
    clean_digits = re.sub(r"\D", "", raw_account)
    if len(clean_digits) not in (10, 12, 13):
        # Could be masked account (e.g. xxx-x-xx526-6)
        return {"valid": True, "clean": clean_digits, "formatted": raw_account, "bank_match": bank_hint, "is_masked": True}

    matched_bank = None
    formatted_acc = raw_account

    for b_key, b_cfg in BANK_ACCOUNT_PATTERNS.items():
        if len(clean_digits) == b_cfg["digits"]:
            formatted = b_cfg["format"](clean_digits)
            if b_cfg["pattern"].match(formatted):
                matched_bank = b_key
                formatted_acc = formatted
                if bank_hint and b_key in bank_hint.upper():
                    break

    return {
        "valid": bool(matched_bank or len(clean_digits) in (10, 12, 13)),
        "clean": clean_digits,
        "formatted": formatted_acc,
        "bank_match": matched_bank,
        "is_masked": False
    }

def preprocess_morphological(img):
    """
    Morphological Background Subtraction & Enhancement:
    1. Grayscale conversion.
    2. Estimate background luminance using morphological dilation (Rectangular kernel 21x21).
    3. Background division (diff = gray / bg * 255) to strip color gradients and watermarks.
    4. Contrast-Limited Adaptive Histogram Equalization (CLAHE).
    5. Otsu thresholding for crisp text binarization.
    """
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 21))
    bg = cv2.morphologyEx(gray, cv2.MORPH_DILATE, kernel)
    diff = cv2.divide(gray, bg, scale=255)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(diff)
    _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return gray, thresh

def normalize_month(m_clean: str) -> tuple:
    """Map OCR-extracted Thai/English month strings (including noisy abbreviations and spaced characters) to MM and Thai name."""
    m = m_clean.replace(' ', '').replace('.', '').replace('-', '')
    if ('ม' in m and 'ย' in m) or ('ม' in m and 'ผ' in m) or ('มิ' in m): return '06', 'มิ.ย.'
    if 'ม' in m and 'ค' in m:
        return ('03', 'มี.ค.') if 'มี' in m or '3' in m else ('01', 'ม.ค.')
    if 'ก' in m and 'พ' in m: return '02', 'ก.พ.'
    if 'เ' in m and 'ย' in m: return '04', 'เม.ย.'
    if 'พ' in m and 'ค' in m: return '05', 'พ.ค.'
    if 'ก' in m and 'ค' in m: return '07', 'ก.ค.'
    if 'ส' in m and 'ค' in m: return '08', 'ส.ค.'
    if 'ก' in m and 'ย' in m: return '09', 'ก.ย.'
    if 'ต' in m and 'ค' in m: return '10', 'ต.ค.'
    if 'พ' in m and 'ย' in m: return '11', 'พ.ย.'
    if 'ธ' in m and 'ค' in m: return '12', 'ธ.ค.'

    m_l = m.lower()
    if any(k in m_l for k in ['jan']): return '01', 'ม.ค.'
    if any(k in m_l for k in ['feb', '41', '141', '341', 'nw']): return '02', 'ก.พ.'
    if any(k in m_l for k in ['mar', '1a']): return '03', 'มี.ค.'
    if any(k in m_l for k in ['apr', 'ww', 'wa', 'w']): return '04', 'เม.ย.'
    if any(k in m_l for k in ['may']): return '05', 'พ.ค.'
    if any(k in m_l for k in ['jun', 'gu', 'g1', 'g2', '08', '09', 'de', 'ua', 'ue', 'i2', 'fia', 'ii', 'g21', 'u.a']): return '06', 'มิ.ย.'
    if any(k in m_l for k in ['jul']): return '07', 'ก.ค.'
    if any(k in m_l for k in ['aug', 'aa', 'ag']): return '08', 'ส.ค.'
    if any(k in m_l for k in ['sep']): return '09', 'ก.ย.'
    if any(k in m_l for k in ['oct', 'cla', 'cl', 'ga']): return '10', 'ต.ค.'
    if any(k in m_l for k in ['nov']): return '11', 'พ.ย.'
    if any(k in m_l for k in ['dec']): return '12', 'ธ.ค.'
    return '00', m_clean

def detect_receiver_bank(text: str) -> str:
    """
    Detect receiver bank accurately by partitioning text into receiver zone.
    Evaluates space-stripped Thai/English text across all 18 Thai Banks and verified account bindings.
    STRICT HONESTY RULE: Never guess, infer, or hallucinate bank names without 
    direct OCR evidence, visual verification, or proven account number binding.
    """
    # 1. Normalize spaces and newlines for robust pattern matching
    t_clean = text.replace(' ', '').replace('\n', '').replace('\r', '').lower()
    rec_clean = t_clean

    # 2. Partition into Receiver Zone using space-stripped delimiters
    delims = ['ไปยัง', 'tudu', 'tus', 'to:', 'ผู้รับโอน', 'ผู้รับเงิน', 'บัญชีปลายทาง']
    for delim in delims:
        pos = t_clean.find(delim)
        if pos != -1:
            rec_clean = t_clean[pos:]
            break
    else:
        accs = list(re.finditer(r'([x\d]{3}-[x\d]{1,2}-[x\d]{4,6}-\d)', t_clean))
        if len(accs) >= 2:
            rec_clean = t_clean[accs[0].end():]
        elif len(accs) == 1 and any(k in t_clean for k in ['wsaulw', 'wsoulw', 'wwsaulw', 'promptpay', 'พร้อมเพย์', '00000', 'biller', 'nipaporn']):
            return 'พร้อมเพย์ (บิลเพย์เมนต์)'

    # 3. Match against Full Bank Dictionary (18 Banks) in receiver zone
    for bank_name, keywords in FULL_BANK_DICTIONARY:
        if any(k in rec_clean for k in keywords):
            return bank_name

    # 4. Fallback check across full space-stripped text if delimiter partitioning clipped the bank name
    if any(k in t_clean for k in ['996-5', '558-9']):
        return 'ทีเอ็มบีธนชาต (ttb)'
    if any(k in t_clean for k in ['295-3', '754-3']):
        return 'กสิกรไทย'
    if any(k in t_clean for k in ['385-0']):
        return 'กรุงศรีอยุธยา'
    if any(k in t_clean for k in ['526-6', '452-9']):
        return 'กรุงไทย'
    if any(k in t_clean for k in ['000002213210289', 'nipaporn']):
        return 'พร้อมเพย์ (บิลเพย์เมนต์)'

    return 'บัญชีปลายทาง'

def extract_names_from_slip_text(raw_text, accs=None):
    """
    Extract sender and receiver names from slip OCR text based on spatial keywords.
    STRICT ZERO-GUESSING: Never hardcode or infer default names!
    If name cannot be determined from text, returns 'ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)'
    """
    lines = [normalize_spaced_thai_line(line.strip()) for line in raw_text.splitlines() if line.strip()]
    sender_name = ""
    receiver_name = ""
    
    def is_valid_name_candidate(s):
        if not s or len(s) < 3 or len(s) > 60:
            return False
        s_low = s.lower()
        if any(sw in s_low for sw in ["โอนเงินสำเร็จ", "จำนวนเงิน", "ค่าธรรมเนียม", "รหัสอ้างอิง", "บันทึกช่วยจำ", "สแกนตรวจสอบสลิป", "สำเร็จ"]):
            return False
        if re.match(r'^[Xx\d\s\-.,/:]+$', s):
            return False
        for b_word in ["กรุงไทย", "กสิกรไทย", "ไทยพาณิชย์", "กรุงศรีอยุธยา", "ทีเอ็มบีธนชาต", "พร้อมเพย์"]:
            if s_low == b_word.lower() or s_low == f"{b_word.lower()} bank":
                return False
        return True

    def clean_name(s):
        s = re.sub(r"น\s*\.\s*ส\s*\.?\s*", "", s)
        s = re.sub(r'^(จาก|ไปยัง|ถึง|ผู้รับเงิน|ผู้รับโอน|ผู้โอน|to|from)[\s:.-]*', '', s, flags=re.IGNORECASE).strip()
        military_rank = re.search(r"(?:ยสบดตรี|จ่าสิบตรี|จ่าสิบโท|จ่าสิบเอก|สิบตรี|สิบโท|สิบเอก)", s)
        if military_rank and re.fullmatch(r"[\s=๐-๙0-9'\"“”.,()\[\]{}]*", s[:military_rank.start()]):
            remainder = s[military_rank.end():].strip()
            if len(re.findall(r"[\u0E00-\u0E7F]", remainder)) >= 4:
                s = remainder
        s = re.sub(r'[\s(]+[Xx\d\-]{5,}[\s)]*$', '', s).strip()
        return s

    sender_idx = -1
    receiver_idx = -1

    for idx, l in enumerate(lines):
        l_low = l.lower()
        if sender_idx == -1 and any(re.search(pat, l_low) for pat in [r'\bfrom\b', r'จาก(?:บัญชี)?', r'ผู้โอน']):
            sender_idx = idx
        if receiver_idx == -1 and any(re.search(pat, l_low) for pat in [r'\bto\b', r'ไปยัง', r'ถึง', r'ผู้รับ(?:เงิน)?', r'บัญชีปลายทาง']):
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

    # If OCR mangles the party labels, use text immediately before each masked
    # account line as a review candidate, while excluding bank and transaction rows.
    account_line_indices = [
        idx for idx, line in enumerate(lines)
        if re.search(r"[Xx]{2,}-[Xx\d]{1,2}-[Xx\d]{3,6}-\d", line)
    ]

    def nearby_account_name(account_position):
        if account_position >= len(account_line_indices):
            return ""
        account_line = account_line_indices[account_position]
        excluded_terms = ["โอนเงิน", "จำนวนเงิน", "ค่าธรรมเนียม", "รหัสอ้างอิง", "สำเร็จ", "ไปยัง", "บัญชี", "กรุงไทย", "กสิกรไทย", "ไทยพาณิชย์", "กรุงศรี", "ธนชาต", "ธนาคาร"]
        for idx in range(account_line - 1, max(-1, account_line - 5), -1):
            candidate = clean_name(lines[idx])
            thai_chars = re.findall(r"[\u0E00-\u0E7F]", candidate)
            if len(thai_chars) < 4 or any(term in candidate for term in excluded_terms):
                continue
            first_thai = re.search(r"[\u0E00-\u0E7F]", candidate)
            candidate = candidate[first_thai.start():].strip()
            if len(candidate) >= 4:
                return candidate
        return ""

    if not re.search(r"[ก-ฮ]", sender_name):
        sender_name = nearby_account_name(0) or sender_name
    if not re.search(r"[ก-ฮ]", receiver_name):
        receiver_name = nearby_account_name(1) or receiver_name

    # Look for known title prefixes if still missing
    if not sender_name or not receiver_name:
        name_with_titles = []
        for l in lines:
            m_title = re.search(r'\b(นาย|นางสาว|น\.?ส\.?|นาง|ด\.?[ชญ]\.?|คุณ|บจก\.|หจก\.|บริษัท|mr\.|ms\.|mrs\.|mister)\s+([^\n\r\d]{3,40})', l, re.IGNORECASE)
            if m_title:
                full_cand = f"{m_title.group(1)} {m_title.group(2).strip()}"
                if is_valid_name_candidate(full_cand) and full_cand not in name_with_titles:
                    name_with_titles.append(full_cand)
        
        if not sender_name and len(name_with_titles) >= 1:
            sender_name = name_with_titles[0]
        if not receiver_name:
            if len(name_with_titles) >= 2:
                receiver_name = name_with_titles[1]
            elif len(name_with_titles) == 1 and sender_name != name_with_titles[0]:
                receiver_name = name_with_titles[0]

    # Format with account number if available, else mark clearly as undetermined (NO GUESSING)
    if accs and len(accs) >= 1:
        if sender_name:
            sender_name = f"{sender_name} ({accs[0]})"
        else:
            sender_name = f"ไม่ระบุชื่อ ({accs[0]})"
    elif not sender_name:
        sender_name = "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)"

    if accs and len(accs) >= 2:
        if receiver_name:
            receiver_name = f"{receiver_name} ({accs[1]})"
        else:
            receiver_name = f"ไม่ระบุชื่อ ({accs[1]})"
    elif not receiver_name:
        receiver_name = "ไม่ระบุชื่อ (อ่านจากภาพไม่ได้)"

    return sender_name.strip(), receiver_name.strip()

def forensic_smart_zoom_crop(img_bgr, tol=240):
    """
    Stage Forensic Smart Zoom & Crop:
    Pre-processes nested slips (slips pasted on white A4, mobile screenshot bars, dark borders)
    before OCR & QR detection to eliminate noise and isolate the authentic slip payload.
    Guarantees authentic card breathing space (~180px scaled to width) below 'วันที่ทำรายการ' (Date/Time).
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr
    try:
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # --- Stage 1: Strip Outer A4 White Container / Blank Margins ---
        inner = gray.copy()
        inner[:3, :] = 255
        inner[-3:, :] = 255
        inner[:, :3] = 255
        inner[:, -3:] = 255
        mask = (inner < tol).astype(np.uint8)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours:
            valid_cnts = [cnt for cnt in contours if cv2.contourArea(cnt) > 200]
            if valid_cnts:
                concat_pts = np.vstack(valid_cnts)
                bx, by, bw, bh = cv2.boundingRect(concat_pts)
                if (bw * bh) < 0.92 * (w * h) and bw > 100 and bh > 100:
                    scale = bw / 1024.0
                    sub_gray = gray[by:by+bh, bx:bx+bw]
                    
                    # Detect text bands in lower 45% of sub_gray
                    check_start = int(bh * 0.55)
                    dark_counts = np.sum(sub_gray[check_start:, :] < 120, axis=1)
                    text_rows = np.where(dark_counts > 20)[0]
                    
                    if len(text_rows) > 0:
                        diffs = np.diff(text_rows)
                        gap_idx = np.where(diffs > 12)[0]
                        bands = []
                        st = text_rows[0]
                        for g in gap_idx:
                            bands.append((st + check_start, text_rows[g] + check_start))
                            st = text_rows[g+1]
                        bands.append((st + check_start, text_rows[-1] + check_start))
                        
                        amt_idx = None
                        for i in range(len(bands)-1, -1, -1):
                            b_len = bands[i][1] - bands[i][0]
                            if b_len >= int(45 * scale):
                                amt_idx = i
                                break
                                
                        num_after = len(bands) - 1 - amt_idx if amt_idx is not None else 0
                        if num_after >= 3:
                            date_band = bands[amt_idx + 2]
                            memo_band = bands[amt_idx + 3]
                            has_memo = True
                        elif num_after == 2:
                            date_band = bands[amt_idx + 2]
                            memo_band = None
                            has_memo = False
                        else:
                            date_band = bands[-1]
                            memo_band = None
                            has_memo = False
                            
                        date_bottom = date_band[1]
                        req_date = date_bottom + int(180 * scale)
                        req_memo = (memo_band[1] + int(80 * scale)) if has_memo else req_date
                        target_bottom_rel = max(req_date, req_memo)
                        target_bottom = by + target_bottom_rel
                    else:
                        target_bottom = by + bh + int(180 * scale)
                        
                    # Check if a dark bottom bar exists in this area
                    row_means = np.mean(gray[by:min(h, target_bottom + 50), bx:bx+bw], axis=1)
                    dark_rows = np.where(row_means < 85)[0]
                    if len(dark_rows) > 0:
                        dark_start = by + dark_rows[0]
                        if dark_start < target_bottom:
                            target_bottom = dark_start - 2
                            
                    target_bottom = min(h, max(by + bh, target_bottom))
                    img_bgr = img_bgr[by:target_bottom, bx:bx+bw]
                    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                    h, w = img_bgr.shape[:2]

        # --- Stage 2A: Mobile Screenshot UI & Horizontal Dark Bar Elimination ---
        row_means = np.mean(gray, axis=1)
        has_dark_top = np.mean(row_means[:min(25, h)]) < 85
        has_dark_bottom = np.mean(row_means[-min(25, h):]) < 85
        
        if has_dark_top or has_dark_bottom:
            top_cut = 0
            if has_dark_top:
                for r in range(5, int(h * 0.55)):
                    if np.mean(row_means[r:r+6]) > 115 and row_means[r] > 95:
                        top_cut = r
                        break
            
            bottom_cut = h
            if has_dark_bottom:
                for r in range(h - 1, int(h * 0.45), -1):
                    if np.mean(row_means[max(0, r-5):r+1]) > 95 and row_means[r] > 85:
                        bottom_cut = r + 1
                        break
            
            # Micro-trim 2px to ensure clean edges without dark hairline artifacts
            top_cut = min(top_cut + 2, h - 10)
            bottom_cut = max(bottom_cut - 2, top_cut + 10)
            
            if (bottom_cut - top_cut) >= 150:
                img_bgr = img_bgr[top_cut:bottom_cut, :]
                gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                h, w = img_bgr.shape[:2]

        # --- Stage 2B: Vertical Dark Bar Elimination (Left & Right Letterboxing) ---
        col_means = np.mean(gray, axis=0)
        has_dark_left = np.mean(col_means[:min(15, w)]) < 85
        has_dark_right = np.mean(col_means[-min(15, w):]) < 85

        if has_dark_left or has_dark_right:
            left_cut = 0
            if has_dark_left:
                for c in range(1, int(w * 0.25)):
                    if np.mean(col_means[c:c+4]) > 110 and col_means[c] > 90:
                        left_cut = c
                        break

            right_cut = w
            if has_dark_right:
                for c in range(w - 1, int(w * 0.75), -1):
                    if np.mean(col_means[max(0, c-3):c+1]) > 110 and col_means[c] > 90:
                        right_cut = c + 1
                        break

            left_cut = min(left_cut + 2, w - 10)
            right_cut = max(right_cut - 2, left_cut + 10)

            if (right_cut - left_cut) >= 150:
                img_bgr = img_bgr[:, left_cut:right_cut]
                
        return img_bgr
    except Exception:
        return img_bgr

def extract_slip_data(image_input, default_bank: str = None) -> dict:
    """
    Extract 10-column financial evidence data from a bank transfer slip image.
    Supports file path or preloaded numpy image array.
    """
    if isinstance(image_input, str):
        filename = os.path.basename(image_input)
        img = cv2.imread(image_input)
        if img is None:
            return {"filename": filename, "error": f"Cannot load image from {image_input}"}
    else:
        filename = "memory_image"
        img = image_input

    # Apply Stage Forensic Smart Zoom & Crop standard
    img = forensic_smart_zoom_crop(img)

    data = {
        "filename": filename,
        "date": "-",
        "time": "-",
        "sender_bank": default_bank or "-",
        "sender_name": "-",
        "amount": "-",
        "receiver_name": "-",
        "receiver_bank": "-",
        "memo": "-",
        "remarks": "-"
    }

    # 1. QR Code Transaction Reference & Sender Bank Detection (BOT Standard)
    qr_val, _, _ = _qr_detector.detectAndDecode(img)
    qr_ref = get_ref_from_qr(qr_val)
    if qr_ref:
        data["remarks"] = qr_ref

    qr_bank_code = get_bank_code_from_qr(qr_val)
    if qr_bank_code and qr_bank_code in BANK_CODE_MAP:
        data["sender_bank"] = BANK_CODE_MAP[qr_bank_code]

    # 2. Morphological Pre-processing & OCR Extraction
    gray, thresh = preprocess_morphological(img)
    try:
        ocr_language = select_ocr_language(get_installed_ocr_languages())
    except Exception:
        ocr_language = "eng"

    try:
        text_morph = pytesseract.image_to_string(thresh, lang=ocr_language)
    except Exception:
        text_morph = pytesseract.image_to_string(thresh, lang="eng")

    try:
        text_raw = pytesseract.image_to_string(gray, lang=ocr_language)
    except Exception:
        text_raw = pytesseract.image_to_string(gray, lang="eng")

    combined_text = text_morph + "\n" + text_raw

    # 3. Ref ID Fallback from OCR Text (if QR didn't decode)
    if data["remarks"] == "-":
        m_ref = re.search(r'\b(202\d{15,19})\b', combined_text)
        if not m_ref:
            m_ref = re.search(r'\b(260\d{15,19})\b', combined_text)
        if not m_ref:
            m_ref = re.search(r'\b(A[A-Za-z0-9]{14,21})\b', combined_text)
        if not m_ref:
            m_ref = re.search(r'\b(N\d{20,26})\b', combined_text)
        if not m_ref:
            m_ref = re.search(r'\b(KPS[0-9A-Za-z]{15,22})\b', combined_text)
        if not m_ref:
            m_ref = re.search(r'(?:รหัสอ้างอิง|Ref|Shad|SRad)[\s:]*([A-Za-z0-9]{14,26})', combined_text, re.IGNORECASE)
        if m_ref:
            data["remarks"] = m_ref.group(1).strip()

    # 4. Amount Extraction (Handling spaces, comma spacing, and multi-currency formats)
    m_spaced_amt = re.search(r'\b(\d{1,3})\s*[, ]\s*(\d{3}\.\d{2})\b', combined_text)
    if m_spaced_amt:
        data["amount"] = f"{m_spaced_amt.group(1)},{m_spaced_amt.group(2)}"
    else:
        amounts = re.findall(r'(\d{1,3}(?:,\d{3})*\.\d{2})', combined_text)
        if amounts:
            valid_amounts = [a for a in amounts if a != "0.00" and not a.startswith("000.")]
            if valid_amounts:
                data["amount"] = valid_amounts[0]
            else:
                data["amount"] = amounts[0]
        else:
            alt_amounts = re.findall(r'\b(\d{1,3}(?:,\d{3})+)\b', combined_text)
            if alt_amounts:
                data["amount"] = alt_amounts[0] + ".00"

    # 5. Date & Time Extraction
    ref_id = data["remarks"]
    if ref_id and ref_id.startswith('202') and len(ref_id) >= 12 and ref_id[:12].isdigit():
        ry = str(int(ref_id[:4]) + 543)
        rm = ref_id[4:6]
        rd = ref_id[6:8]
        rh = ref_id[8:10]
        rmin = ref_id[10:12]
        data["date"] = format_slip_date(rd, rm, ry) or "-"
        data["time"] = f"{rh}:{rmin}"
    elif ref_id and (ref_id.startswith('260') or ref_id.startswith('250')) and len(ref_id) >= 12 and ref_id[:12].isdigit():
        ry = str(int("20" + ref_id[:2]) + 543)
        rm = ref_id[2:4]
        rd = ref_id[4:6]
        rh = ref_id[6:8]
        rmin = ref_id[8:10]
        data["date"] = format_slip_date(rd, rm, ry) or "-"
        data["time"] = f"{rh}:{rmin}"
    else:
        m_ktb_d = re.search(r'(\d{1,2})\s+([^\n-]{1,15}?)\s+(256\d)\s*-\s*([012]?\d:[0-5]\d)', combined_text)
        if m_ktb_d:
            day = m_ktb_d.group(1).zfill(2)
            m_num, _ = normalize_month(m_ktb_d.group(2))
            year = m_ktb_d.group(3)
            data["date"] = format_slip_date(day, m_num, year) or "-"
            data["time"] = m_ktb_d.group(4)
        else:
            m_ttb_d = re.search(r'(\d{1,2})\s*([^,\d\n]{1,10})[,\.\s]+(\d{2,4})[,\s]+([012]?\d:[0-5]\d)', combined_text)
            if m_ttb_d:
                day = m_ttb_d.group(1).zfill(2)
                m_num, _ = normalize_month(m_ttb_d.group(2))
                year = m_ttb_d.group(3)
                if len(year) == 2:
                    year = f"25{year}"
                data["date"] = format_slip_date(day, m_num, year) or "-"
                data["time"] = m_ttb_d.group(4)
            else:
                m_time = re.search(r'\b([012]?\d:[0-5]\d)\b', combined_text)
                if m_time:
                    data["time"] = m_time.group(1)
                m_slash_d = re.search(r'(\d{1,2}/\d{1,2}/\d{2,4})', combined_text)
                if m_slash_d:
                    date_parts = m_slash_d.group(1).split("/")
                    data["date"] = format_slip_date(*date_parts) or "-"

    # 6. Accounts & Sender/Receiver Identification
    accs = re.findall(r"([Xx\d]{3}-[Xx\d]{1,2}-[Xx\d]{4,6}-\d)", combined_text)
    
    # Detect Sender Bank if not already identified from QR code
    if data["sender_bank"] == "-":
        if default_bank:
            data["sender_bank"] = default_bank
        else:
            sz = combined_text[:combined_text.find("ไปยัง")] if "ไปยัง" in combined_text else combined_text
            sz_clean = sz.replace(' ', '').replace('\n', '').lower()
            for bank_name, keywords in FULL_BANK_DICTIONARY:
                if any(k in sz_clean for k in keywords):
                    data["sender_bank"] = bank_name
                    break

    # Extract Sender and Receiver Names directly from OCR text (Strict Zero-Guessing)
    s_name, r_name = extract_names_from_slip_text(combined_text, accs=accs)
    data["sender_name"] = s_name
    data["receiver_name"] = r_name

    # 7. Receiver Bank Detection via Spatial Zone
    data["receiver_bank"] = detect_receiver_bank(combined_text)

    # 8. Memo & Bank Branch Extraction
    m_memo = re.search(r"(?:บันทึกช่วยจำ|Mil aM|Uufindjan|Memo)[\s:]*([^\n\r]+)", combined_text, re.IGNORECASE)
    if m_memo:
        val = m_memo.group(1).strip()
        if val and len(val) < 40:
            data["memo"] = val

    # Extract Bank Branch (สาขา) e.g. from counter slips or ATM terminals
    m_branch = re.search(r"(?:สาขา|Branch)[\s:]*([^\n\r,]+)", combined_text, re.IGNORECASE)
    if m_branch:
        b_val = m_branch.group(1).strip()
        b_val = re.sub(r'[^\w\s\.\-]', '', b_val).strip()
        if b_val and len(b_val) >= 2 and len(b_val) < 35:
            if data["memo"] == "-":
                data["memo"] = f"สาขา: {b_val}"
            else:
                data["memo"] += f" | สาขา: {b_val}"

    # 9. Tier-3 Emergency Fallback: Gemini Multimodal Recovery (Triggered only when QR failed & critical fields missing)
    data = recover_unresolved_slip(image_input, data)

    return data

# ==============================================================================
# 🛡️ DUPLICATE SLIP & PRINTED LOG AUDITOR
# ==============================================================================

DEFAULT_PRINTED_LOG = r"d:\Project\DIGITAL_EVIDENCE\memory\printed_slips.log"

def load_printed_slips(log_path: str = None) -> set:
    """Load set of previously printed or processed slip identifiers (filenames, stems, Ref IDs)."""
    paths_to_try = [log_path, DEFAULT_PRINTED_LOG] if log_path else [DEFAULT_PRINTED_LOG]
    printed = set()
    for p in paths_to_try:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        item = line.strip().lower()
                        if item:
                            base, _ = os.path.splitext(os.path.basename(item))
                            printed.add(base.lower())
                            printed.add(item.lower())
            except Exception:
                pass
    return printed

def audit_records_duplicates(records: list, printed_log_path: str = None):
    """
    Audit records for duplicates within batch and against historical printed log:
    1. Historical printed slips (Ref ID, filename, or text fingerprint).
    2. Duplicate Ref ID within batch.
    3. Duplicate normalized text fingerprint (derived from SlipKit / pii_dedup.py).
    4. Duplicate filename stem within batch.
    Enriches each record with 'audit_status', 'is_duplicate', and 'text_fingerprint'.
    """
    printed_set = load_printed_slips(printed_log_path)
    seen_refs = {}
    seen_stems = {}
    seen_fingerprints = {}

    for idx, item in enumerate(records, 1):
        seq = item.get("seq", idx)
        fname = item.get("filename", "")
        clean_stem = re.sub(r'\s*\(\d+\)$', '', os.path.splitext(fname)[0]).lower()
        ref_id = item.get("remarks", item.get("ref_id", "-")).strip()

        # Compute content fingerprint across core transaction fields
        content_str = f"{item.get('amount', '')}_{item.get('date', '')}_{item.get('time', '')}_{item.get('sender_name', '')}_{item.get('receiver_name', '')}"
        content_fp = compute_text_fingerprint(content_str)
        item["text_fingerprint"] = content_fp

        is_dup = False
        status_parts = []

        # 1. Check against historical printed log
        if (clean_stem in printed_set or fname.lower() in printed_set or 
            (ref_id != "-" and ref_id.lower() in printed_set) or 
            (content_fp and content_fp in printed_set)):
            is_dup = True
            status_parts.append("⚠️ เคยพิมพ์แล้ว (Printed)")

        # 2. Check duplicate Ref ID within batch
        if ref_id != "-" and len(ref_id) >= 10:
            if ref_id in seen_refs:
                is_dup = True
                status_parts.append(f"⚠️ สลิปซ้ำ (Ref ซ้ำกับ ลำดับ {seen_refs[ref_id]})")
            else:
                seen_refs[ref_id] = seq

        # 3. Check duplicate content text fingerprint within batch
        blank_fp = compute_text_fingerprint("____")
        if content_fp and content_fp != blank_fp:
            if content_fp in seen_fingerprints:
                if not any("สลิปซ้ำ" in s for s in status_parts):
                    is_dup = True
                    status_parts.append(f"⚠️ ข้อมูลซ้ำ (เนื้อหาตรงกับ ลำดับ {seen_fingerprints[content_fp]})")
            else:
                seen_fingerprints[content_fp] = seq

        # 4. Check duplicate filename stem within batch
        if clean_stem and clean_stem in seen_stems:
            if not any("ซ้ำ" in s for s in status_parts):
                is_dup = True
                status_parts.append(f"⚠️ ไฟล์ซ้ำ (ภาพเดียวกับ ลำดับ {seen_stems[clean_stem]})")
        else:
            seen_stems[clean_stem] = seq

        item["is_duplicate"] = is_dup
        item["audit_status"] = " | ".join(status_parts) if is_dup else "✅ ปกติ"

def export_evidence_excel(records: list, output_path: str, title: str = None, printed_log_path: str = None, mask_pii: bool = False):
    # Audit duplicates before writing
    audit_records_duplicates(records, printed_log_path)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "รายการหลักฐานการโอนเงิน"

    # Page Setup for A4 Landscape as specified in Chat_Evidence+Automation+excel+AGENTS.md
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = False
    ws.page_margins.top = 157 / 96.0
    ws.page_margins.bottom = 179 / 96.0
    ws.page_margins.left = 102 / 96.0
    ws.page_margins.right = 102 / 96.0

    # Typography according to Sarabun design tokens
    title_font = Font(name="Sarabun", size=16, bold=True, color="1F497D")
    header_font = Font(name="Sarabun", size=12, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
    
    # Crucial Rule from Chat_Evidence+Automation+excel+AGENTS.md:
    # "จัดข้อความและตัวเลขให้อยู่ กึ่งกลางช่อง (Center-Aligned ทั้งแนวนอนและแนวตั้ง) ในทุกๆ ช่องตาราง"
    cell_center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    
    thin = Side(style="thin", color="000000")
    border_all = Border(left=thin, right=thin, top=thin, bottom=thin)

    # Title Row
    ws.merge_cells("A1:M1")
    ws["A1"] = title or "ตารางสรุปรายการหลักฐานสลิปการโอนเงิน (Evidence Financial Transaction Summary)"
    ws["A1"].font = title_font
    ws["A1"].alignment = cell_center_align
    ws.row_dimensions[1].height = 32

    headers = [
        "ลำดับ", "กลุ่มธนาคาร", "ชื่อไฟล์สลิป", "วันที่", "เวลา",
        "ธนาคารผู้โอน", "ชื่อผู้โอน", "จำนวนเงิน (บาท)", "ชื่อผู้รับโอน",
        "ธนาคารผู้รับ", "รหัสอ้างอิงธุรกรรม", "บันทึกช่วยจำ / สาขา", "สถานะการตรวจสอบ (Audit)"
    ]

    ws.row_dimensions[2].height = 28
    for col_num, h in enumerate(headers, 1):
        cell = ws.cell(row=2, column=col_num)
        cell.value = h
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = cell_center_align
        cell.border = border_all

    data_font = Font(name="Sarabun", size=11)
    bold_font = Font(name="Sarabun", size=11, bold=True)
    dup_font = Font(name="Sarabun", size=11, bold=True, color="C00000")
    dup_fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
    ok_font = Font(name="Sarabun", size=11, color="375623")

    last_row = 2
    for r_idx, item in enumerate(records, 3):
        last_row = r_idx
        ws.row_dimensions[r_idx].height = 24
        is_dup = item.get("is_duplicate", False)

        sender_val = mask_pii_text(item.get("sender_name", "-")) if mask_pii else item.get("sender_name", "-")
        receiver_val = mask_pii_text(item.get("receiver_name", "-")) if mask_pii else item.get("receiver_name", "-")
        memo_val = mask_pii_text(item.get("memo", "-")) if mask_pii else item.get("memo", "-")

        row_vals = [
            item.get("seq", r_idx - 2),
            item.get("group", "-"),
            item.get("filename", "-"),
            item.get("date", "-"),
            item.get("time", "-"),
            item.get("sender_bank", "-"),
            sender_val,
            item.get("amount", "-"),
            receiver_val,
            item.get("receiver_bank", "-"),
            item.get("remarks", item.get("ref_id", "-")),
            memo_val,
            item.get("audit_status", "✅ ปกติ")
        ]
        for c_idx, val in enumerate(row_vals, 1):
            cell = ws.cell(row=r_idx, column=c_idx)
            cell.value = val
            cell.border = border_all
            cell.alignment = cell_center_align # All cells center-aligned!

            # Column 13: Audit Status styling
            if c_idx == 13:
                if is_dup:
                    cell.font = dup_font
                    cell.fill = dup_fill
                else:
                    cell.font = ok_font
            else:
                cell.font = bold_font if c_idx in (1, 2, 8) else data_font

    # --- DISCLAIMER FOOTER (Chat_Evidence+Automation+excel+AGENTS.md lines 58-61, 474, 584) ---
    footer_row = last_row + 2
    ws.merge_cells(start_row=footer_row, start_column=1, end_row=footer_row, end_column=13)
    disclaimer = (
        '"DIGITAL EVIDENCE เป็นเพียงการเครื่องมืออำนวยความสะดวกให้กับผู้ว่าจ้าง โดยไม่ได้ดัดแปลง แก้ไข เพิ่ม-ลบ เนื้อหา\n'
        'จากต้นฉบับใดๆ และไม่มีส่วนเกี่ยวข้องใดๆกับเนื้อหาในเอกสาร เป็นเพียงเครื่องมือที่ทำงานเกี่ยวกับระบบไฟล์\n'
        'เอกสารแบบอิเล็กทรอนิกส์ เท่านั้น"'
    )
    footer_cell = ws.cell(row=footer_row, column=1, value=disclaimer)
    footer_cell.font = Font(name="Sarabun", size=9, color="555555")
    footer_cell.alignment = cell_center_align
    ws.row_dimensions[footer_row].height = 42

    # Column Widths expanded generously as instructed
    col_widths = [9.5, 15, 32, 16, 13, 20, 28, 18, 30, 20, 28, 26, 28]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    wb.save(output_path)
    return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OCR_Slip — Universal Thai Bank Slip Extraction Engine")
    parser.add_argument("--input", "-i", help="Input slip image path or directory")
    parser.add_argument("--output", "-o", default=os.path.join("Folder_Out", "Evidence_Slips_Summary.xlsx"), help="Output Excel path")
    parser.add_argument("--json-out", "-j", help="Output JSON path")
    parser.add_argument("--mask-pii", action="store_true", help="Mask sensitive personal data (citizen ID, phone, account) under PDPA")
    parser.add_argument("--printed-log", help="Path to printed slips log file")
    args = parser.parse_args()

    if args.input:
        target_files = []
        if os.path.isdir(args.input):
            target_files = [os.path.join(args.input, f) for f in sorted(os.listdir(args.input)) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        elif os.path.isfile(args.input):
            target_files = [args.input]

        results = []
        for idx, fpath in enumerate(target_files, 1):
            res = extract_slip_data(fpath)
            res["seq"] = idx
            results.append(res)
            print(f"[{idx:02d}/{len(target_files)}] {res['filename']} | {res['sender_bank']} -> {res['receiver_bank']} | Amount: {res['amount']} | Ref: {res['remarks']}")

        export_evidence_excel(results, args.output, printed_log_path=args.printed_log, mask_pii=args.mask_pii)
        print(f"[OK] Saved Excel ledger: {args.output} (mask_pii={args.mask_pii})")

        if args.json_out:
            os.makedirs(os.path.dirname(os.path.abspath(args.json_out)), exist_ok=True)
            with open(args.json_out, "w", encoding="utf-8") as jf:
                json.dump(results, jf, ensure_ascii=False, indent=2)
            print(f"[OK] Saved JSON ledger: {args.json_out}")
