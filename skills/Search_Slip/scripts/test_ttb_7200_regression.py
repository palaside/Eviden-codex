"""Reproduce the 7,200 THB ttb slip failures without changing evidence pixels."""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import fitz
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from search_slip import (
    clean_and_normalize_datetime,
    detect_slip_in_image,
    extract_slip_details_ocr,
    search_slips_in_pdf,
    supplement_review_fields,
)


SAMPLE = Path(__file__).resolve().parents[3] / "For Test" / "Done" / "A4_IMG_ (23).PNG"
SAMPLE_SHA256 = "514d19fca2ba5685a7a361068aeca336e462e546e0d93640f497ab596e0e462f"
CHAT_ONLY = Path(__file__).resolve().parents[3] / "For Test" / "แชทที่ 3" / "chatv3 (75).jpg"
CHAT_ONLY_SHA256 = "bea25da71a6f6f313c133860b4abde8abdfebe519183dc306b157d7a2f75d953"
EMBEDDED_SLIP = Path(__file__).resolve().parents[3] / "For Test" / "แชทที่ 3" / "chatv3 (73).jpg"
EMBEDDED_SLIP_SHA256 = "907c8cd4708cfe03c27e1db99e3b85532a122ce3b32b9d024b2063bb14fab23e"

# Captured from the unmodified sample with Tesseract script/Thai+eng at native size.
OCR_TRANSCRIPT = """17 ม ิ . ย . 2568 15:52 >
โอนเงินสำเร็จ
17 0.8. 68, 15:51 u.
1,200.00
น า ย ณั ช ช ั ย ร ั ก ษา ว ง ษ์
XXX-X-XX558-9
ttb
น . ส . จ ิ ณ ห ์ น ิ ภา ป ร ะ ส า ท เข ต ร ก า ร
XXX-X-XX996-5
ttb
"""


class TestTtb7200Regression(unittest.TestCase):
    def sample_image(self):
        if not SAMPLE.is_file():
            self.skipTest(f"Source evidence unavailable: {SAMPLE}")
        self.assertEqual(hashlib.sha256(SAMPLE.read_bytes()).hexdigest(), SAMPLE_SHA256)
        image = cv2.imread(str(SAMPLE))
        self.assertIsNotNone(image)
        return image

    def test_pdf_150_dpi_detector_finds_the_whole_slip(self):
        self.sample_image()
        document = fitz.open()
        try:
            page = document.new_page(width=595, height=842)
            page.insert_image(page.rect, filename=str(SAMPLE))
            pix = page.get_pixmap(dpi=150)
            rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            found, box = detect_slip_in_image(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        finally:
            document.close()
        self.assertTrue(found, "The PDF scan misses the visible ttb slip")
        x, y, width, height = box
        self.assertLessEqual(x, 600)
        self.assertLessEqual(y, 750)
        self.assertGreaterEqual(x + width, 800)
        self.assertGreaterEqual(y + height, 1200)

    def test_native_ocr_keeps_the_visible_amount(self):
        result = extract_slip_details_ocr(self.sample_image())
        self.assertEqual(result["amount"], "7,200.00")

    def test_transaction_time_wins_over_gallery_header(self):
        with patch("search_slip.pytesseract.image_to_string", return_value=OCR_TRANSCRIPT):
            result = extract_slip_details_ocr(np.zeros((32, 32, 3), dtype=np.uint8))
        self.assertEqual(result["datetime"], "17 มิ.ย. 2568 - 15:51")

    def test_reference_timestamp_is_not_transaction_time(self):
        self.assertEqual(
            clean_and_normalize_datetime("17 มิ.ย. 68, 15:51 น.", "202506171502627774"),
            "17 มิ.ย. 2568 - 15:51",
        )

    def test_banks_follow_masked_account_rows_without_from_to_labels(self):
        with patch("search_slip.pytesseract.image_to_string", return_value=OCR_TRANSCRIPT):
            result = extract_slip_details_ocr(np.zeros((32, 32, 3), dtype=np.uint8))
        self.assertEqual(result["sender_bank"], "ทีเอ็มบีธนชาต (ttb)")
        self.assertEqual(result["receiver_bank"], "ทีเอ็มบีธนชาต (ttb)")

    def test_names_remain_attached_to_their_masked_accounts(self):
        with patch("search_slip.pytesseract.image_to_string", return_value=OCR_TRANSCRIPT):
            result = extract_slip_details_ocr(np.zeros((32, 32, 3), dtype=np.uint8))
        self.assertIn("ณัชชัย", result["sender"])
        self.assertIn("XXX-X-XX558-9", result["sender"])
        self.assertIn("จิณห์นิภา", result["receiver"])
        self.assertIn("XXX-X-XX996-5", result["receiver"])

    def test_chat_only_amount_does_not_become_a_slip_occurrence(self):
        if not CHAT_ONLY.is_file():
            self.skipTest(f"Source evidence unavailable: {CHAT_ONLY}")
        self.assertEqual(hashlib.sha256(CHAT_ONLY.read_bytes()).hexdigest(), CHAT_ONLY_SHA256)
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "chat-only.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_image(page.rect, filename=str(CHAT_ONLY))
            document.save(pdf_path)
            document.close()
            self.assertEqual(search_slips_in_pdf(str(pdf_path), output_excel=False, output_json=False), [])

    def test_pdf_scan_keeps_ttb_7200_and_visible_transaction_time(self):
        self.sample_image()
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "ttb-7200.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_image(page.rect, filename=str(SAMPLE))
            document.save(pdf_path)
            document.close()
            results = search_slips_in_pdf(str(pdf_path), output_excel=False, output_json=False)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["amount"], "7,200.00")
        self.assertEqual(results[0]["datetime"], "17 มิ.ย. 2568 - 15:51")
        self.assertIn("ณัฐชัย", results[0]["sender_name"])
        self.assertIn("จิณห์นิภา", results[0]["receiver_name"])
        self.assertEqual(results[0]["sender_bank"], "ทีเอ็มบีธนชาต (ttb)")
        self.assertEqual(results[0]["receiver_bank"], "ทีเอ็มบีธนชาต (ttb)")
        self.assertIn("ต้องตรวจทาน", results[0]["review_status"])

    def test_embedded_ttb_slip_does_not_use_reference_time(self):
        if not EMBEDDED_SLIP.is_file():
            self.skipTest(f"Source evidence unavailable: {EMBEDDED_SLIP}")
        self.assertEqual(hashlib.sha256(EMBEDDED_SLIP.read_bytes()).hexdigest(), EMBEDDED_SLIP_SHA256)
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "embedded-ttb.pdf"
            document = fitz.open()
            page = document.new_page(width=595, height=842)
            page.insert_image(page.rect, filename=str(EMBEDDED_SLIP))
            document.save(pdf_path)
            document.close()
            results = search_slips_in_pdf(str(pdf_path), output_excel=False, output_json=False)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["amount"], "7,200.00")
        self.assertEqual(results[0]["datetime"], "17 มิ.ย. 2568 - 15:51")
        self.assertIn("ณัฐชัย", results[0]["sender_name"])
        self.assertIn("จิณห์นิภา", results[0]["receiver_name"])
        self.assertEqual(results[0]["sender_bank"], "ทีเอ็มบีธนชาต (ttb)")
        self.assertEqual(results[0]["receiver_bank"], "ทีเอ็มบีธนชาต (ttb)")
        self.assertIn("ต้องตรวจทาน", results[0]["review_status"])

    def test_supplemental_ocr_cannot_mix_another_amount_or_account(self):
        primary = {
            "amount": "7,200.00", "sender_acc": "XXX-X-XX558-9", "receiver_acc": "XXX-X-XX996-5",
            "sender": "ไม่ระบุชื่อ (XXX-X-XX558-9)", "receiver_bank": "-",
        }
        focused = {
            "amount": "1,200.00", "sender_acc": "XXX-X-XX558-9", "receiver_acc": "XXX-X-XX996-5",
            "sender": "นาย คนอื่น", "receiver_bank": "ทีเอ็มบีธนชาต (ttb)", "raw_text": "unmatched OCR",
        }
        self.assertEqual(supplement_review_fields(primary.copy(), focused), primary)
        focused["amount"] = "7,200.00"
        focused["receiver_acc"] = "XXX-X-XX000-0"
        self.assertEqual(supplement_review_fields(primary.copy(), focused), primary)


if __name__ == "__main__":
    unittest.main()
