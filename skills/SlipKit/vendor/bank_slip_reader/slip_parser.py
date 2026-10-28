"""
bank_slip_reader/slip_parser.py
แปลง OCR text → BankSlipData
รองรับ 2 mode:
  - rule_based : regex เท่านั้น (ไม่ต้องการ API)
  - ai         : GPT-4o-mini (ต้องมี OPENAI_API_KEY)
"""
import re
import json
import asyncio
from datetime import datetime
from typing import Optional

from .models import BankSlipData, BankName
from .bank_detector import BankDetector


# ──────────────────────────────────────────────────────────────────────────────
#  Helper regexes
# ──────────────────────────────────────────────────────────────────────────────
AMOUNT_PAT = [
    r"จำนวนเงิน[: \t]*([\d,]+\.?\d*)",
    r"ยอดโอน[: \t]*([\d,]+\.?\d*)",
    r"ยอดชำระ[: \t]*([\d,]+\.?\d*)",
    r"amount[: \t]*([\d,]+\.?\d*)",
    r"([\d,]+\.\d{2})[ \t]*(?:บาท|thb|baht)",
    r"([\d,.]+)[ \t]*(?:บาท|thb|baht)",
    r"([\d,]+)[ \t]*บาท"
]

DATE_PAT = [
    r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})",      # dd/mm/yyyy
    r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2})",       # dd/mm/yy
    (                                                   # dd monthTH yyyy
        r"(\d{1,2})\s*(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|"
        r"ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|"
        r"มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|"
        r"กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{2,4})"
    ),
]
TIME_PAT_LIST = [
    r"\b([0-2]?\d):([0-5]\d)\b",               # HH:MM with ':'
    r"\b([0-2]?\d)\.([0-5]\d)\s*(?:น\.|น)\b"   # HH.MM น.
]
# Backward compatibility variable
TIME_PAT = TIME_PAT_LIST[0]
REF_PAT   = [
    r"(?:transaction\s*id|ref(?:erence)?|เลขอ้างอิง|หมายเลข|รหัส)[^\w]*([\w\-]{6,30})",
    r"\b([A-Z]{1,3}[\-]?\d{6,20})\b",
    r"\b([A-Z0-9]{10,})\b",
    r"\b(\d{15,22})\b",
    r"\b([Nn]\d{20,22})\b",
    r"\b([Nn]\d{8,15})\b",  # shorter N-prefixed IDs
    r"\b(\d{6,12})\b",    # plain numeric reference IDs
]  # added patterns for varied reference formats
SENDER_LABELS   = [
    "จาก", "ผู้โอน", "โอนจาก", "from", "sender", "ชื่อบัญชีต้นทาง",
    "วันที่กลาย",  # OCR เบี้ยวของ 'ชื่อผู้โอน'
    "mr.", "นาย", "sender name",
]
RECEIVER_LABELS = [
    "ถึง", "ผู้รับ", "โอนไปยัง", "to", "receiver", "ชื่อบัญชีปลายทาง",
    "receiver name", "บจก.", "บริษัท", "ไปยัง"
]
MEMO_LABELS = [
    "บันทึกช่วยจำ",
    "บันทึกช่วยจํา",
    "memo",
    "note",
]

ACCOUNT_PAT     = r"(?:[A-Za-z]+\s)?[xX\d]{3}[-\s]?[xX\d]{1,7}[-\s]?[xX\d]{1,7}[-\s]?[xX\d]{0,2}"

THAI_MONTH_MAP = {
    "มกราคม": 1, "ม.ค.": 1, "ม.ค": 1,
    "กุมภาพันธ์": 2, "ก.พ.": 2, "ก.พ": 2,
    "มีนาคม": 3, "มี.ค.": 3, "มี.ค": 3,
    "เมษายน": 4, "เม.ย.": 4, "เม.ย": 4,
    "พฤษภาคม": 5, "พ.ค.": 5, "พ.ค": 5,
    "มิถุนายน": 6, "มิ.ย.": 6, "มิ.ย": 6,
    "กรกฎาคม": 7, "ก.ค.": 7, "ก.ค": 7,
    "สิงหาคม": 8, "ส.ค.": 8, "ส.ค": 8,
    "กันยายน": 9, "ก.ย.": 9, "ก.ย": 9,
    "ตุลาคม": 10, "ต.ค.": 10, "ต.ค": 10,
    "พฤศจิกายน": 11, "พ.ย.": 11, "พ.ย": 11,
    "ธันวาคม": 12, "ธ.ค.": 12, "ธ.ค": 12,
    # Common Google Vision OCR confusion for "พ.ค." on TTB slips.
    "W.A.": 5, "W.A": 5, "w.a.": 5, "w.a": 5,
}


# ──────────────────────────────────────────────────────────────────────────────
#  SlipParser
# ──────────────────────────────────────────────────────────────────────────────
class SlipParser:

    def __init__(self, openai_api_key: Optional[str] = None, mode: str = "rule_based"):
        """
        mode: "rule_based" (default, no API) | "ai" (requires openai_api_key)
        """
        self.mode = mode
        self.api_key = openai_api_key
        self.detector = BankDetector()
        self.bank_noise_tokens = self._build_bank_noise_tokens()

    def _build_bank_noise_tokens(self) -> set[str]:
        tokens: set[str] = {
            "bank", "banks", "thai", "payment", "transfer", "success",
            "krungthai", "kasikorn", "kbank", "scb", "ttb", "tmb",
            "กรุงไทย", "กสิกรไทย", "ไทยพาณิชย์", "ทหารไทย", "ธนชาต",
            "ธนาคาร", "โอนเงินสำเร็จ", "รหัสอ้างอิง", "จำนวนเงิน", "ค่าธรรมเนียม",
        }

        for bank in BankName:
            if bank == BankName.UNKNOWN:
                continue
            tokens.update(self._extract_text_tokens(bank.value))

        for cfg in self.detector.BANK_PATTERNS.values():
            for keyword in cfg.get("keywords", []):
                tokens.update(self._extract_text_tokens(keyword))

        return {self._normalize_token(token) for token in tokens if self._normalize_token(token)}

    def _extract_text_tokens(self, value: str) -> set[str]:
        normalized = re.sub(r"\\[bBsSdwW\.\+\*\?\^\$\|\(\)\[\]\{\}-]", " ", value)
        normalized = normalized.replace("\\", " ")
        parts = re.findall(r"[A-Za-z]{3,}|[ก-๙]{2,}", normalized.lower())
        return {part.strip() for part in parts if part.strip()}

    def _normalize_token(self, value: str) -> str:
        return re.sub(r"[^a-z0-9ก-๙]+", "", value.lower())

    def _is_bank_or_header_name(self, value: str) -> bool:
        normalized = self._normalize_token(value)
        if not normalized:
            return True

        candidate_tokens = {
            self._normalize_token(token)
            for token in re.findall(r"[A-Za-z]{2,}|[ก-๙]{2,}", value.lower())
            if self._normalize_token(token)
        }

        # Reject pure bank/header lines like "Krungthai" or "ธนาคารกรุงไทย".
        if normalized in self.bank_noise_tokens:
            return True
        if candidate_tokens and candidate_tokens.issubset(self.bank_noise_tokens):
            return True

        return False

    def _is_account_like_line(self, value: str, account_pattern: re.Pattern) -> bool:
        stripped = value.strip()
        if not stripped:
            return False

        account_match = account_pattern.search(stripped)
        if not account_match:
            return False

        compact_line = re.sub(r"\s+", "", stripped)
        compact_account = re.sub(r"\s+", "", account_match.group(0))
        account_chars = len(re.sub(r"[^A-Za-z0-9xX-]", "", compact_account))
        line_chars = len(re.sub(r"[^A-Za-z0-9ก-๙xX\.-]", "", compact_line))

        if compact_account.lower() == compact_line.lower():
            return True
        if line_chars and account_chars / line_chars >= 0.65:
            return True

        return False

    def _has_receiver_label(self, line: str) -> bool:
        lower_line = line.lower()
        for label in RECEIVER_LABELS:
            lower_label = label.lower()
            if lower_label == "to":
                if re.search(r"\bto\s*[:：]", lower_line):
                    return True
                continue
            if lower_label in lower_line:
                return True
        return False

    # ─── Public ──────────────────────────────────────────────────────────────
    async def parse(self, raw_text: str, file_name: str = "") -> BankSlipData:
        slip = BankSlipData(raw_text=raw_text, file_name=file_name)

        # 1. Detect bank
        bank, conf = self.detector.detect(raw_text)
        slip.bank_name        = bank
        slip.bank_confidence  = conf

        # 2. Extract structured data
        try:
            if self.mode == "ai" and self.api_key:
                try:
                    parsed = await self._ai_parse(raw_text, bank)
                    slip = self._merge(slip, parsed)
                except:
                    pass
            
            # Always run rule_parse to fill gaps
            slip = self._rule_parse(slip, raw_text)
            slip.success = True
        except Exception as e:
            slip.error_message = str(e)

        return slip

    # ─── Rule-based ───────────────────────────────────────────────────────────
    def _rule_parse(self, slip: BankSlipData, text: str) -> BankSlipData:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

        if slip.transaction_time is None:
            slip.transaction_time = self._parse_time(text)
        if slip.amount is None:
            slip.amount = self._parse_amount(text)
        if slip.transaction_date is None:
            slip.transaction_date = self._parse_date(text)
        if slip.transaction_id is None:
            slip.transaction_id = self._parse_ref(text)

        
        s_n, s_a, r_n, r_a = self._parse_parties(lines)
        if not slip.sender_name: slip.sender_name = s_n
        if not slip.sender_account: slip.sender_account = s_a
        if not slip.receiver_name: slip.receiver_name = r_n
        if not slip.receiver_account: slip.receiver_account = r_a
        if not slip.receiver_bank:
            slip.receiver_bank = self._parse_receiver_bank(lines)
        if (
            slip.receiver_bank
            and self._is_merchant_payment(text, slip.receiver_name)
            and slip.receiver_bank == slip.bank_name.value
        ):
            slip.receiver_bank = None
        # Memo extraction (rule based)
        if slip.memo is None:
            slip.memo = self._parse_memo(text)

        return slip

    def _parse_receiver_bank(self, lines: list[str]) -> Optional[str]:
        receiver_section = False
        receiver_lines = []

        for line in lines:
            lower_line = line.lower()
            if "ไปยัง" in lower_line or self._has_receiver_label(line):
                receiver_section = True
                receiver_lines.append(line)
                continue
            if receiver_section:
                receiver_lines.append(line)

        if not receiver_lines:
            account_indexes = [
                i for i, line in enumerate(lines)
                if re.search(ACCOUNT_PAT, line)
            ]
            if len(account_indexes) >= 2:
                receiver_account_index = account_indexes[1]
                receiver_lines = lines[receiver_account_index:receiver_account_index + 4]
            else:
                return None

        bank, _ = self.detector.detect("\n".join(receiver_lines[:6]))
        return None if bank == BankName.UNKNOWN else bank.value

    def _is_merchant_payment(self, text: str, receiver_name: Optional[str]) -> bool:
        merchant_markers = [
            "จ่ายบิลสำเร็จ",
            "เติมเงินสำเร็จ",
            "รหัสร้านค้า",
            "รหัสธุรกรรมถุงเงิน",
            "tungngern",
            "truemoney shop",
            "พร้อมเพย์ e-wallet",
        ]
        lower_text = text.lower()
        lower_receiver = (receiver_name or "").lower()
        if any(marker in lower_text for marker in merchant_markers):
            return True
        if any(marker in lower_receiver for marker in ["tungngern", "truemoney", "e-wallet"]):
            return True
        if receiver_name and re.search(r"[A-Za-z]{2,}\s+[A-Za-z]{2,}", receiver_name):
            return True
        return False

    def _parse_time(self, text: str) -> Optional[str]:
        """Extract time from OCR text.
        Tries multiple TIME_PAT patterns. Returns HH:MM (seconds omitted) or None.
        """
        for pat in TIME_PAT_LIST:
            m = re.search(pat, text)
            if m:
                hour = m.group(1).zfill(2)
                minute = m.group(2).zfill(2)
                return f"{hour}:{minute}"
        return None

    def _parse_amount(self, text: str) -> Optional[float]:
        """Parse amount from OCR text using AMOUNT_PAT patterns.
        Returns a float or None.
        """
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        skip_line = re.compile(r"ค่าธรรมเนียม|fee|รหัส|อ้างอิง|reference|ref|บัญชี|account", re.IGNORECASE)

        for line in lines:
            if skip_line.search(line):
                continue
            label_match = re.search(r"(?:จำนวนเงิน|ยอดโอน|ยอดชำระ|amount)[: \t]*([\d,]+\.?\d*)", line, re.IGNORECASE)
            if label_match:
                amount = self._parse_amount_candidate(label_match.group(1))
                if amount is not None and amount > 0:
                    return amount

            decimal_match = re.search(r"(?<![\d-])([\d,]+\.\d{2})(?!\d)", line)
            if decimal_match:
                amount = self._parse_amount_candidate(decimal_match.group(1))
                if amount is not None and amount > 0:
                    return amount

        for pat in AMOUNT_PAT:
            for m in re.finditer(pat, text, re.IGNORECASE):
                amount = self._parse_amount_candidate(m.group(1))
                if amount is not None and amount > 0:
                    return amount

        candidates = re.findall(r"[\d,]+\.\d{2}", text)
        best = None
        for c in candidates:
            v = self._parse_amount_candidate(c)
            if v is not None and v > 0 and not (2000 <= v <= 2100):
                if best is None or v > best:
                    best = v
        return best

    def _parse_amount_candidate(self, value: str) -> Optional[float]:
        # Convert Thai digits to Arabic and remove spaces before parsing
        thai_digits = "๐๑๒๓๔๕๖๗๘๙"
        arabic_digits = "0123456789"
        trans_table = str.maketrans({t: a for t, a in zip(thai_digits, arabic_digits)})
        # Translate Thai digits to Arabic and strip whitespace
        normalized = value.translate(trans_table).replace(" ", "").replace(",", "").strip()
        # Remove any non-digit/non-dot characters from the integer part
        digits = re.sub(r"\D", "", normalized.split(".")[0])
        if len(digits) > 9:
            return None
        try:
            amount = float(normalized)
        except ValueError:
            return None
        if amount < 0 or amount > 999_999_999:
            return None
        return amount

    def _parse_date(self, text: str) -> Optional[datetime]:
        # Pattern 1: dd/mm/yyyy or dd/mm/yy
        m = re.search(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})", text)
        if m:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if y > 2100:
                y -= 543
            try:
                return datetime(y, mo, d)
            except ValueError:
                pass

        m = re.search(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2})", text)
        if m:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            y += 2000 if y < 70 else 1900
            try:
                return datetime(y, mo, d)
            except ValueError:
                pass

        # Pattern 2: Thai written month
        for month_str, month_num in sorted(THAI_MONTH_MAP.items(), key=lambda x: -len(x[0])):
            pat = rf"(\d{{1,2}})\s*{re.escape(month_str)}\s*(\d{{2,4}})"
            m = re.search(pat, text)
            if m:
                d, y = int(m.group(1)), int(m.group(2))
                if y < 100:
                    y += 2500
                if y > 2100:
                    y -= 543
                try:
                    return datetime(y, month_num, d)
                except ValueError:
                    pass

        for m in re.finditer(r"(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])", text):
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            try:
                return datetime(y, mo, d)
            except ValueError:
                continue

        for line in text.splitlines():
            if not re.search(r"รหัส|อ้างอิง|reference|ref", line, re.IGNORECASE):
                continue
            m = re.search(r"\b(2\d)(0[1-9]|1[0-2])([0-2]\d|3[01])\d{6,}", line)
            if not m:
                continue
            y, mo, d = int(m.group(1)) + 2000, int(m.group(2)), int(m.group(3))
            try:
                return datetime(y, mo, d)
            except ValueError:
                continue

        return None

    def _parse_ref(self, text: str) -> Optional[str]:
        for pat in REF_PAT:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return None

    # ─── Memo extraction ────────────────────────────────────────────────────────
    def _parse_memo(self, text: str) -> Optional[str]:
        """Extract memo field based on known label variations.
        Returns the memo text if found, otherwise None.
        """
        lines = [ln.rstrip() for ln in text.splitlines()]
        memo_labels = [lbl.lower() for lbl in MEMO_LABELS]
        for i, line in enumerate(lines):
            lower_line = line.lower()
            if any(lbl in lower_line for lbl in memo_labels):
                # Try to capture after label on same line
                pattern = re.compile(r"(?:" + "|".join([re.escape(lbl) for lbl in MEMO_LABELS]) + r")[:\s]*([\S ].*)", re.IGNORECASE)
                m = pattern.search(line)
                candidate = m.group(1).strip() if m else None
                if not candidate and i + 1 < len(lines):
                    candidate = lines[i + 1].strip()
                if candidate:
                    # Filter out unwanted patterns (ref IDs, amounts, dates, times)
                    if any(re.search(pat, candidate, re.IGNORECASE) for pat in REF_PAT):
                        continue
                    if any(re.search(pat, candidate, re.IGNORECASE) for pat in AMOUNT_PAT):
                        continue
                    if any(re.search(pat, candidate) for pat in DATE_PAT):
                        continue
                    if any(re.search(pat, candidate) for pat in TIME_PAT_LIST):
                        continue
                    return candidate
        return None
        for pat in REF_PAT:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return None

    def _parse_parties(self, lines: list[str]):
        sender_name = sender_acc = receiver_name = receiver_acc = None

        thai_name = re.compile(
            r"(?:(?:นาย|นาง(?:สาว)?|น\.ส\.|ด\.ช\.|ด\.ญ\.|สิบตรี|สิบเอก|สิบจ่า|ด\.ร\.|ร\.ต\.|พ\.ต\.|พล\.|Mr\.|Mrs\.|Miss\.)\s*)?"
            r"[ก-๙A-Z][ก-๙a-zA-Z\s\.\*x-]{2,}(?:\s+[ก-๙a-zA-Z\*x-]+)*"
        )
        acc_re = re.compile(ACCOUNT_PAT)

        # รูปแบบ: "Mr. Somchai Meesook" หรือ "นาย สมชาย มีสุข"
        def _clean_person_name(value: str) -> str:
            tokens = re.split(r"\s+", value.strip())
            if not tokens:
                return value.strip()

            cleaned = []
            for token in tokens:
                stripped_token = token.strip()
                if not stripped_token:
                    continue
                if not cleaned and re.fullmatch(r"(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.)", stripped_token):
                    cleaned.append(stripped_token)
                    continue
                if re.fullmatch(r"[ก-๙]{2,}", stripped_token):
                    cleaned.append(stripped_token)
                    continue
                if cleaned:
                    break

            return " ".join(cleaned).strip() or value.strip()

        def _clean_latin_merchant(value: str) -> Optional[str]:
            cleaned = re.sub(r"\b(?:ttb|tbb|tub|thb|tb|b)\b", " ", value, flags=re.IGNORECASE)
            cleaned = re.sub(r"[^A-Za-z0-9&.,'() -]+", " ", cleaned)
            cleaned = re.sub(r"\s+", " ", cleaned).strip(" -.,")
            if len(re.findall(r"\d", cleaned)) >= 8:
                return None
            cleaned = " ".join(
                token for token in cleaned.split()
                if len(token) > 1 or re.search(r"\d", token)
            )
            words = re.findall(r"[A-Za-z]{2,}", cleaned)
            if len(words) < 2:
                return None
            if self._is_bank_or_header_name(cleaned):
                return None
            return cleaned

        def _grab_name(line: str) -> Optional[str]:
            stripped = re.sub(r"^[^:：]*[:：]\s*", "", line).strip()
            if self._is_account_like_line(stripped, acc_re):
                return None
            has_person_prefix = re.search(
                r"(?:นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|สิบตรี|สิบเอก|สิบจ่า|ด\.ร\.|ร\.ต\.|พ\.ต\.)",
                stripped,
            )
            if re.search(r"\d", stripped) and not has_person_prefix and not re.search(r"[ก-๙]", stripped):
                latin_merchant = _clean_latin_merchant(stripped)
                if latin_merchant:
                    return latin_merchant
            if re.search(r"\d", stripped) and not has_person_prefix:
                return None
            if re.search(r"[ก-๙]", stripped):
                thai_candidate = re.sub(r"\s+", " ", stripped).strip()
                looks_like_transaction_line = (
                    re.search(r"\d{1,2}[:.]\d{2}", thai_candidate)
                    or re.search(r"\d[\d,]*\.\d{2}", thai_candidate)
                    or re.search(r"\d{6,}", thai_candidate)
                )
                if (
                    len(thai_candidate) >= 4
                    and has_person_prefix
                    and not looks_like_transaction_line
                    and not self._is_bank_or_header_name(thai_candidate)
                ):
                    return _clean_person_name(thai_candidate)
            m = thai_name.search(stripped)
            if m:
                name = m.group(0).strip()
                # กรองคำที่ไม่ใช่ชื่อคน
                noise = [
                    "ธนาคาร", "Bank", "BANK", "Trading", "Co.,", "Ltd.", "NAME", "KBANK", "SCB", "KTB",
                    "ไปยัง", "โอนเงิน", "รหัส", "อ้างอิง", "จํานวนเงิน", "ค่าธรรมเนียม", "วันที่ทำรายการ",
                    "ถึง", "จาก", "โอนไป", "สำเร็จ", "success", "รายการ", "เวลา", "จำนวนเงิน", "โอน", "ยอด"
                ]
                if (
                    len(name) >= 4
                    and not any(n in name for n in noise)
                    and not self._is_bank_or_header_name(name)
                    and not self._is_account_like_line(name, acc_re)
                ):
                    return _clean_person_name(name)
            latin_merchant = _clean_latin_merchant(stripped)
            if latin_merchant:
                return latin_merchant
            return None

        def _grab_acc(line: str) -> Optional[str]:
            m = acc_re.search(line)
            return m.group(0).strip() if m else None

        for i, line in enumerate(lines):
            ll = line.lower()
            next_line = lines[i + 1] if i + 1 < len(lines) else ""

            if any(lbl in ll for lbl in SENDER_LABELS):
                if sender_name is None:
                    sender_name = _grab_name(line) or _grab_name(next_line)
                if sender_acc is None:
                    sender_acc  = _grab_acc(line) or _grab_acc(next_line)

            if self._has_receiver_label(line):
                if receiver_name is None:
                    receiver_name = _grab_name(line) or _grab_name(next_line)
                if receiver_acc is None:
                    receiver_acc  = _grab_acc(line) or _grab_acc(next_line)

        # If still missing, attempt inference based on surrounding context
        # Infer sender if missing
        if sender_name is None or sender_acc is None:
            for i, line in enumerate(lines):
                # Try name and account on the same line first
                name_candidate = _grab_name(line)
                acc_candidate = _grab_acc(line)
                if name_candidate and acc_candidate:
                    if self._has_receiver_label(line):
                        continue
                    if sender_name is None:
                        sender_name = name_candidate
                    if sender_acc is None:
                        sender_acc = acc_candidate
                    continue
                # Fallback to name on this line and account on next line(s)
                name_candidate = _grab_name(line)
                acc_candidate = _grab_acc(lines[i + 1] if i + 1 < len(lines) else "")
                if not acc_candidate and i + 2 < len(lines):
                    acc_candidate = _grab_acc(lines[i + 2])
                
                if name_candidate and acc_candidate:
                    if self._has_receiver_label(line):
                        continue
                    if sender_name is None:
                        sender_name = name_candidate
                    if sender_acc is None:
                        sender_acc = acc_candidate
                    break

        # Infer receiver after a cue like "ไปยัง" or any receiver label
        if receiver_name is None or receiver_acc is None:
            receiver_section = False
            for i, line in enumerate(lines):
                # Detect start of receiver section
                if "ไปยัง" in line.lower() or self._has_receiver_label(line):
                    receiver_section = True
                    continue
                if not receiver_section:
                    continue
                # Skip visual separators
                if line.strip() in {"***", "---", "___"}:
                    continue
                # Try to capture name if not yet found
                if receiver_name is None:
                    name_candidate = _grab_name(line)
                    if name_candidate:
                        receiver_name = name_candidate
                        continue
                # Try to capture account (same line or next line)
                if receiver_acc is None:
                    acc_candidate = _grab_acc(line)
                    if acc_candidate:
                        receiver_acc = acc_candidate
                        if receiver_name is not None:
                            break
                    else:
                        next_line = lines[i + 1] if i + 1 < len(lines) else ""
                        acc_candidate = _grab_acc(next_line)
                        if acc_candidate:
                            receiver_acc = acc_candidate
                            if receiver_name is not None:
                                break

        if receiver_name is None or receiver_acc is None:
            receiver_section = False
            for i, line in enumerate(lines):
                # Try name and account on the same line first
                name_candidate = _grab_name(line)
                acc_candidate = _grab_acc(line)
                if name_candidate and acc_candidate:
                    if any(lbl in line.lower() for lbl in SENDER_LABELS):
                        # Avoid confusing sender as receiver
                        continue
                    if sender_acc and acc_candidate == sender_acc:
                        continue
                    if receiver_name is None:
                        receiver_name = name_candidate
                    if receiver_acc is None:
                        receiver_acc = acc_candidate
                    continue
                # Detect cue for receiver section
                if "ไปยัง" in line.lower() or self._has_receiver_label(line):
                    receiver_section = True
                    continue
                if receiver_section:
                    # Fallback to name on this line and account on next line(s)
                    name_candidate = _grab_name(line)
                    acc_candidate = _grab_acc(lines[i + 1] if i + 1 < len(lines) else "")
                    if not acc_candidate and i + 2 < len(lines):
                        acc_candidate = _grab_acc(lines[i + 2])

                    if name_candidate and acc_candidate:
                        if sender_acc and acc_candidate == sender_acc:
                            continue
                        if receiver_name is None:
                            receiver_name = name_candidate
                        if receiver_acc is None:
                                receiver_acc = acc_candidate
                        break

        if receiver_name is None or receiver_acc is None:
            sender_account_index = None
            if sender_acc:
                for i, line in enumerate(lines):
                    if sender_acc in line:
                        sender_account_index = i
                        break

            search_start = (sender_account_index + 1) if sender_account_index is not None else 0
            for i in range(search_start, len(lines)):
                name_candidate = _grab_name(lines[i])
                if not name_candidate:
                    continue

                acc_candidate = _grab_acc(lines[i])
                if not acc_candidate and i + 1 < len(lines):
                    acc_candidate = _grab_acc(lines[i + 1])
                if not acc_candidate and i + 2 < len(lines):
                    acc_candidate = _grab_acc(lines[i + 2])

                if acc_candidate and acc_candidate != sender_acc:
                    if receiver_name is None:
                        receiver_name = name_candidate
                    if receiver_acc is None:
                        receiver_acc = acc_candidate
                    break

        return sender_name, sender_acc, receiver_name, receiver_acc

    # ─── AI mode (GPT-4o-mini) ───────────────────────────────────────────────
    async def _ai_parse(self, text: str, bank: BankName) -> dict:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise RuntimeError("ต้องติดตั้ง openai: pip install openai")

        client = AsyncOpenAI(api_key=self.api_key)

        prompt = f"""
จากข้อความสลิปธนาคาร {bank.value} ด้านล่าง
ให้แกะข้อมูลและตอบเป็น JSON format เท่านั้น ห้ามมีข้อความอื่น

ข้อความ:
{text}

**ข้อควรระบุ** (ตอบตามรูปแบบ JSON ด้านล่าง):
- รหัสอ้างอิง (transaction_id) – ตัวอย่างเช่น “รหัสอ้างอิง”, “เลขอ้างอิง”, “Reference”
- จำนวนเงิน (amount) – ตัวเลขและสกุลเงิน (เช่น 4,000.00 หรือ 4000) โดยต้องเป็น float
- วันที่ทำรายการ (transaction_date) – รูปแบบ YYYY-MM-DD (เช่น 2023-10-14) หรือ DD MMM YYYY (เช่น 29 พ.ค. 2569)
- เวลา (transaction_time) – HH:MM:SS หากมี
- ชื่อผู้โอน (sender_name) และเลขบัญชีผู้โอน (sender_account)
- ธนาคารผู้โอน (sender_bank) – หากระบุ
- ชื่อผู้รับ (receiver_name) และเลขบัญชีผู้รับ (receiver_account)
- ธนาคารผู้รับ (receiver_bank)

JSON Format:
{{
    "transaction_id": "เลขอ้างอิง",
    "amount": 0.00,
    "currency": "THB",
    "transaction_date": "YYYY-MM-DD",
    "transaction_time": "HH:MM:SS",
    "sender_name": "ชื่อผู้โอน",
    "sender_account": "เลขบัญชีผู้โอน",
    "sender_bank": "ธนาคารผู้โอน",
    "receiver_name": "ชื่อผู้รับ",
    "receiver_account": "เลขบัญชีผู้รับ",
    "receiver_bank": "ธนาคารผู้รับ"
}}

หมายเหตุ: ถ้าไม่พบให้ใส่ null, amount ต้องเป็น float ไม่มีเครื่องหมายจุลภาค
"""

        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "คุณเป็นผู้เชี่ยวชาญการอ่านสลิปธนาคารไทย ตอบเป็น JSON เท่านั้น"},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)

    def _merge(self, slip: BankSlipData, parsed: dict) -> BankSlipData:
        slip.transaction_id   = parsed.get("transaction_id")
        slip.amount           = parsed.get("amount")
        slip.currency         = parsed.get("currency", "THB")
        slip.sender_name      = parsed.get("sender_name")
        slip.sender_account   = parsed.get("sender_account")
        slip.sender_bank      = parsed.get("sender_bank")
        slip.receiver_name    = parsed.get("receiver_name")
        slip.receiver_account = parsed.get("receiver_account")
        slip.receiver_bank    = parsed.get("receiver_bank")
        slip.memo             = parsed.get("memo")

        date_str = parsed.get("transaction_date")
        time_str = parsed.get("transaction_time", "00:00:00") or "00:00:00"
        if date_str:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    slip.transaction_date = datetime.strptime(
                        f"{date_str} {time_str}" if " " not in fmt else date_str, fmt
                    )
                    break
                except ValueError:
                    pass
        return slip
