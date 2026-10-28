# -*- coding: utf-8 -*-
"""ที่มา + PORT จาก pii_regex.js / duplicate_detector.js (JS ต้นฉบับ) + ส่วนต่อยอด.
   - PII patterns: เบอร์ไทย/ปชช/บัญชี/อีเมล/การ์ด (เท่า JS)
   - duplicates: sha256 ไฟล์ + txId set (เท่า JS) + text fingerprint (ต่อยอด: จับ dup_
     ข้าม encoding ที่ sha จับไม่ได้ โดย hash ข้อความ normalize แล้ว)"""
import hashlib
import re

PHONE = re.compile(r"\b0\d{9}\b")
IDCARD = re.compile(r"(?<!\d)\d{13}(?!\d)")
ACCOUNT = re.compile(r"(?<!\d)\d{10,12}(?!\d)")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")
PATTERNS = [PHONE, IDCARD, ACCOUNT, EMAIL, CARD]


def contains_pii(text):
    t = (text or "").replace(" ", "").replace("-", "")
    return any(p.search(t) for p in PATTERNS)


def sha_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def text_fingerprint(text):
    """normalize ข้อความ (ตัด space/เครื่องหมาย/ตัวพิมพ์) แล้ว hash — dup_ ข้าม encoding เจอด้วยตัวนี้."""
    norm = re.sub(r"\s+", "", text or "").lower()
    norm = re.sub(r"[{}\"',.\-:;/()]", "", norm)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]


class DuplicateGuard:
    def __init__(self):
        self.tx, self.hashes, self.texts = set(), set(), {}

    def check_file(self, path):
        h = sha_file(path)
        dup = h in self.hashes
        self.hashes.add(h)
        return dup, h

    def check_txid(self, txid):
        if not txid:
            return False
        dup = txid in self.tx
        self.tx.add(txid)
        return dup

    def check_text(self, text, label=""):
        fp = text_fingerprint(text)
        dup_of = self.texts.get(fp)
        self.texts.setdefault(fp, label)
        return (dup_of is not None), (dup_of or "")
