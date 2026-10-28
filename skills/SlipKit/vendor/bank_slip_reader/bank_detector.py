"""
bank_slip_reader/bank_detector.py
ตรวจจับธนาคารจาก OCR text ด้วย weighted pattern matching
"""
import re
from .models import BankName


class BankDetector:
    """
    ตรวจจับธนาคารจาก OCR Text โดยใช้ Pattern Matching
    เรียงตามความเฉพาะเจาะจง (ยิ่งเฉพาะ ยิ่งได้คะแนนมาก)
    """

    BANK_PATTERNS: dict = {
        BankName.KBANK: {
            "keywords": [
                r"k\s*plus", r"kplus", r"กสิกรไทย", r"kasikorn",
                r"\bkbank\b", r"k\s*bank", r"บมจ\.?\s*ธนาคารกสิกรไทย",
            ],
            "account_pattern": r"\d{3}-\d{1}-\d{5}-\d{1}",
        },
        BankName.SCB: {
            "keywords": [
                r"\bscb\b", r"ไทยพาณิชย์", r"siam\s*commercial",
                r"scb\s*easy", r"scbeasy", r"easy\s*app",
                r"บมจ\.?\s*ธนาคารไทยพาณิชย์",
            ],
            "account_pattern": r"\d{3}-\d{6}-\d{1}",
        },
        BankName.BBL: {
            "keywords": [
                r"\bbbl\b", r"กรุงเทพ", r"bangkok\s*bank",
                r"bualuang", r"บัวหลวง",
                r"บมจ\.?\s*ธนาคารกรุงเทพ",
            ],
            "account_pattern": r"\d{3}-\d{7}-\d{1}",
        },
        BankName.KTB: {
            "keywords": [
                r"\bktb\b", r"กรุงไทย", r"krungthai",
                r"paotang", r"เป๋าตัง",
                r"บมจ\.?\s*ธนาคารกรุงไทย",
            ],
        },
        BankName.BAY: {
            "keywords": [
                r"\bbay\b", r"กรุงศรี", r"krungsri",
                r"ayudhya", r"อยุธยา", r"\bkma\b",
                r"บมจ\.?\s*ธนาคารกรุงศรีอยุธยา",
            ],
        },
        BankName.TTB: {
            "keywords": [
                r"\bttb\b", r"ทหารไทย", r"ธนชาต",
                r"\btmb\b", r"thanachart", r"ttb\s*touch",
                r"บมจ\.?\s*ธนาคารทหารไทยธนชาต",
            ],
        },
        BankName.GSB: {
            "keywords": [
                r"\bgsb\b", r"ออมสิน",
                r"government\s*savings", r"\bmymo\b",
            ],
        },
        BankName.BAAC: {
            "keywords": [
                r"\bbaac\b", r"ธ\.ก\.ส\.", r"เพื่อการเกษตร",
                r"bank\s*for\s*agriculture",
            ],
        },
        BankName.GHB: {
            "keywords": [
                r"\bghb\b", r"ธอส", r"อาคารสงเคราะห์",
                r"government\s*housing",
            ],
        },
        BankName.UOB: {
            "keywords": [
                r"\buob\b", r"ยูโอบี", r"united\s*overseas",
            ],
        },
        BankName.TISCO: {
            "keywords": [
                r"\btisco\b", r"ทิสโก้",
            ],
        },
        BankName.LHB: {
            "keywords": [
                r"\blh\s*bank\b", r"แลนด์แอนด์เฮาส์", r"\blhb\b",
            ],
        },
        BankName.CIMB: {
            "keywords": [
                r"\bcimb\b", r"ซีไอเอ็มบี",
            ],
        },
        BankName.PROMPTPAY: {
            "keywords": [
                r"prompt\s*pay", r"พร้อมเพย์", r"promptpay",
            ],
        },
    }

    def detect(self, text: str) -> tuple[BankName, float]:
        """
        ตรวจจับธนาคารจากข้อความ
        Returns: (BankName, confidence_score 0-1)
        """
        txt = text.lower()
        scores: dict[BankName, float] = {}

        for bank, cfg in self.BANK_PATTERNS.items():
            score = 0.0
            matched = 0

            for pattern in cfg.get("keywords", []):
                if re.search(pattern, txt, re.IGNORECASE | re.UNICODE):
                    # ยิ่งยาว → ยิ่งเฉพาะ → ได้คะแนนมากกว่า
                    score += max(len(pattern) / 10.0, 0.5)
                    matched += 1

            # โบนัส multi-match
            if matched > 1:
                score *= 1.3

            # โบนัส account pattern
            acc_pat = cfg.get("account_pattern")
            if acc_pat and re.search(acc_pat, text):
                score += 1.0

            if score > 0:
                scores[bank] = score

        if not scores:
            return BankName.UNKNOWN, 0.0

        best = max(scores, key=lambda b: scores[b])
        total = sum(scores.values())
        confidence = min(scores[best] / total, 1.0)

        return best, confidence
