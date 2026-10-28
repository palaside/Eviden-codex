"""
bank_slip_reader/models.py
Data models for Bank Slip OCR System
"""
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
from enum import Enum


class BankName(Enum):
    KBANK      = "ธนาคารกสิกรไทย"
    SCB        = "ธนาคารไทยพาณิชย์"
    BBL        = "ธนาคารกรุงเทพ"
    KTB        = "ธนาคารกรุงไทย"
    BAY        = "ธนาคารกรุงศรีอยุธยา"
    TTB        = "ธนาคารทหารไทยธนชาต"
    GSB        = "ธนาคารออมสิน"
    BAAC       = "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"
    GHB        = "ธนาคารอาคารสงเคราะห์"
    UOB        = "ธนาคารยูโอบี"
    TISCO      = "ธนาคารทิสโก้"
    LHB        = "ธนาคารแลนด์แอนด์เฮาส์"
    CIMB       = "ธนาคารซีไอเอ็มบีไทย"
    PROMPTPAY  = "พร้อมเพย์"
    UNKNOWN    = "ไม่ทราบธนาคาร"


@dataclass
class BankSlipData:
    # ─── Bank info ────────────────────────────────
    bank_name:          BankName        = BankName.UNKNOWN
    bank_confidence:    float           = 0.0

    # ─── Transaction ──────────────────────────────
    transaction_id:     Optional[str]   = None
    amount:             Optional[float] = None
    currency:           str             = "THB"
    transaction_date:   Optional[datetime] = None
    transaction_time:   Optional[str] = None

    # ─── Sender ───────────────────────────────────
    sender_name:        Optional[str]   = None
    sender_account:     Optional[str]   = None
    sender_bank:        Optional[str]   = None

    # ─── Receiver ─────────────────────────────────
    receiver_name:      Optional[str]   = None
    receiver_account:   Optional[str]   = None
    receiver_bank:      Optional[str]   = None

    # ─── Meta ─────────────────────────────────────
    raw_text:           str             = ""
    file_name:          str             = ""
    processing_time:    float           = 0.0
    success:            bool            = False
    error_message:      Optional[str]   = None
    memo:               Optional[str]   = None

    def to_dict(self) -> dict:
        return {
            "bank_name":       self.bank_name.value,
            "bank_code":       self.bank_name.name,
            "bank_confidence": round(self.bank_confidence, 4),
            "transaction_id":  self.transaction_id,
            "amount":          self.amount,
            "currency":        self.currency,
            "transaction_date": (
                self.transaction_date.isoformat()
                if self.transaction_date else None
            ),
            "transaction_time": self.transaction_time,
            "sender": {
                "name":    self.sender_name,
                "account": self.sender_account,
                "bank":    self.sender_bank,
            },
            "receiver": {
                "name":    self.receiver_name,
                "account": self.receiver_account,
                "bank":    self.receiver_bank,
            },
            "memo":            self.memo,
            "file_name":       self.file_name,
            "processing_time": round(self.processing_time, 3),
            "success":         self.success,
            "error_message":   self.error_message,
        }

    def export_pdf(self):
        pass
