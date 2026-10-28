# slip_parser.py – Bank detection, cleaning, and QR code extraction for slip images

import re
import json
import subprocess
import difflib
from pathlib import Path
from typing import List, Dict, Any

# Optional: Use pyzbar for QR code scanning
try:
    from pyzbar.pyzbar import decode as qr_decode
    from PIL import Image
except ImportError:
    qr_decode = None
    Image = None

# Master list of supported banks (Thai banks example)
BANK_MASTER_LIST = [
    "KTB",
    "SCB",
    "KBANK",
    "BBL",
    "TMB",
    "CIMB",
    "CITIBANK",
    "UOB",
    "HSBC",
    "BANK OF CHINA",
    # add more as needed
]

# Keyword lists for each bank (lowercase)
BANK_KEYWORDS = {
    "KTB": ["krungthai next", "krungthai", "next"],
    "SCB": ["scb easy", "scb", "easy"],
    "KBANK": ["k plus", "kasikornbank", "kasikorn", "กสิกร", "kbank", "k plus"],
    "TTB": ["ttb touch", "ttb", "ทหารไทยธนชาต", "touch"],
    "BBL": ["bbl", "bangkok bank"],
    "TMB": ["tmb", "tbank"],
    "CIMB": ["cimb"],
    "CITIBANK": ["citi", "citibank"],
    "UOB": ["uob"],
    "HSBC": ["hsbc"],
    # extend as needed
}

def detect_bank_by_keywords(text: str) -> List[str]:
    """Detect bank codes based on keyword presence in lowercased text.
    Returns a list of detected bank codes in order of appearance (first match wins).
    """
    detected = []
    lowered = text.lower()
    for code, keywords in BANK_KEYWORDS.items():
        for kw in keywords:
            if kw in lowered:
                if code not in detected:
                    detected.append(code)
                break
    return detected

# Titles / prefixes to strip from personal names
NAME_PREFIXES = ["นาย", "นาง", "นางสาว", "พ.ต.อ.", "ดร.", "ด.ญ.", "อ." ]

def fuzzy_bank_match(keyword: str) -> str:
    """Return the best matching bank name from MASTER list using fuzzy matching."""
    matches = difflib.get_close_matches(keyword.upper(), BANK_MASTER_LIST, n=1, cutoff=0.6)
    return matches[0] if matches else keyword.upper()

def clean_name(name: str) -> str:
    """Remove legal prefixes and trim whitespace."""
    for prefix in NAME_PREFIXES:
        if name.startswith(prefix):
            name = name[len(prefix):]
    return name.strip()

def extract_qr_payload(image_path: str) -> Dict[str, str]:
    """Attempt to decode a QR code from the slip image.
    Returns a dict with possible keys: bank_from, bank_to, amount, txn_id.
    """
    if qr_decode is None:
        return {}
    try:
        img = Image.open(image_path)
        decoded = qr_decode(img)
        for obj in decoded:
            data = obj.data.decode('utf-8')
            # Assuming payload is JSON like {'bank_from':'KBANK','amount':'1234.56',...}
            try:
                payload = json.loads(data)
                return payload
            except json.JSONDecodeError:
                # fallback: simple key=value pairs separated by '&'
                kv = dict(pair.split('=') for pair in data.split('&') if '=' in pair)
                return kv
    except Exception as e:
        print(f"QR decode error: {e}")
    return {}

def ocr_text(image_path: str) -> str:
    """Run Tesseract OCR on the image and return extracted text.
    This is a thin wrapper; ensure tesseract is installed on the system.
    """
    try:
        result = subprocess.run([
            "tesseract",
            image_path,
            "stdout",
            "-l",
            "tha+eng",
            "--psm",
            "6"  # Assume a single uniform block of text
        ], capture_output=True, text=True, check=True)
        return result.stdout
    except Exception as e:
        print(f"OCR failed: {e}")
        return ""

def parse_slip(image_path: str) -> Dict[str, Any]:
    """Parse a slip image and return a structured record.
    Steps:
        1. Try QR code extraction – if successful, trust its data.
        2. Run OCR to get raw text.
        3. Use regex to locate date, time, amount, bank names, and parties.
        4. Apply fuzzy matching and cleaning.
    """
    record: Dict[str, Any] = {
        "image_path": str(Path(image_path).resolve()),
        "bank_from": None,
        "bank_to": None,
        "name_from": None,
        "name_to": None,
        "amount": None,
        "date": None,
        "time": None,
        "notes": None,
        "remarks": None,
        "txn_id": None,
    }

    # 1. QR fallback
    qr_data = extract_qr_payload(image_path)
    if qr_data:
        record.update({
            "bank_from": fuzzy_bank_match(qr_data.get("bank_from", "")),
            "bank_to": fuzzy_bank_match(qr_data.get("bank_to", "")),
            "amount": qr_data.get("amount"),
            "date": qr_data.get("date"),
            "time": qr_data.get("time"),
            "txn_id": qr_data.get("txn_id"),
        })
        # If QR provides sufficient data, we can return early
        return record

    # 2. OCR extraction
    text = ocr_text(image_path)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()

    # Example regex patterns (Thai language may require Unicode support)
    date_pat = re.compile(r"(\d{1,2}/\d{1,2}/\d{2,4})")
    time_pat = re.compile(r"(\d{1,2}:\d{2}(?::\d{2})?)")
    amount_pat = re.compile(r"([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)")
    bank_pat = re.compile(r"(TTB|K\s*PLUS|SCB|KBANK|BBL|TMB|CIMB|CITIBANK|UOB|HSBC)", re.IGNORECASE)
    name_pat = re.compile(r"(?:(นาย|นางสาว|นาง)\s*)?([\u0E00-\u0E7F]+)"
    )

    # Extract date & time
    date_match = date_pat.search(text)
    time_match = time_pat.search(text)
    record["date"] = date_match.group(1) if date_match else None
    record["time"] = time_match.group(1) if time_match else None

    # Extract amount (take the first large number that looks like money)
    amount_match = amount_pat.search(text)
    record["amount"] = amount_match.group(1).replace(",", "") if amount_match else None

    # Detect banks via keyword matching
    detected_banks = detect_bank_by_keywords(text)
    if detected_banks:
        record["bank_from"] = fuzzy_bank_match(detected_banks[0])
    if len(detected_banks) > 1:
        record["bank_to"] = fuzzy_bank_match(detected_banks[1])

    # Extract personal names – naive approach: find two name patterns
    names = name_pat.findall(text)
    if names:
        # names is list of tuples (prefix?, name)
        clean_names = [clean_name(" ".join(filter(None, pair))) for pair in names]
        if clean_names:
            record["name_from"] = clean_names[0]
        if len(clean_names) > 1:
            record["name_to"] = clean_names[1]

    # Additional notes – anything after a marker like "หมายเหตุ" or "Notes:" (English)
    notes_match = re.search(r"(?:หมายเหตุ|Notes?)[:\s]+([^$]+)", text, re.IGNORECASE)
    if notes_match:
        record["notes"] = notes_match.group(1).strip()

    # Remarks – placeholder for future AI validation
    record["remarks"] = None

    return record

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python slip_parser.py <image_path>")
        sys.exit(1)
    result = parse_slip(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))
