import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from yolo_slip_api import enhance_crop_for_ocr, parse_ocr_lines


class YoloSlipOcrTests(unittest.TestCase):
    def test_enhancement_pipeline_returns_full_ocr_stages(self):
        import cv2
        import numpy as np

        crop = np.full((40, 60, 3), 210, dtype=np.uint8)
        crop[15:25, 10:50] = 80

        variants, stages = enhance_crop_for_ocr(crop)

        self.assertGreaterEqual(len(variants), 4)
        self.assertEqual(stages, [
            "gamma_normalization", "median_denoise", "bilateral_denoise",
            "clahe_contrast", "unsharp_mask", "upscale",
        ])
        self.assertTrue(all(isinstance(image, np.ndarray) for image in variants))
        self.assertTrue(all(image.dtype == np.uint8 for image in variants))

    def test_parses_thai_slip_fields_from_crop_lines(self):
        lines = [
            "โอนเงินสำเร็จ",
            "จาก",
            "สิบตรีณัฐชัย S***",
            "กรุงไทย",
            "ไปยัง",
            "น.ส. จินหณิกา ประสาทเขตรการ",
            "ttb",
            "จำนวนเงิน 3,000.00 บาท",
            "วันที่ทำรายการ 20 มิ.ย. 2568 - 14:15",
        ]

        result = parse_ocr_lines(lines)

        self.assertEqual(result["transaction"]["amount"], 3000.0)
        self.assertEqual(result["transaction"]["date"], "2025-06-20")
        self.assertEqual(result["transaction"]["time"], "14:15")
        self.assertEqual(result["sender"]["name"], "สิบตรีณัฐชัย S***")
        self.assertEqual(result["receiver"]["name"], "น.ส. จินหณิกา ประสาทเขตรการ")

    def test_keeps_two_masked_accounts_in_party_order(self):
        result = parse_ocr_lines([
            "โอนเงินสำเร็จ",
            "XXX-X-XX558-9",
            "ttb",
            "XXX-X-XX996-5",
            "ttb",
            "7,200.00",
        ])

        self.assertEqual(result["sender"]["account_no"], "XXX-X-XX558-9")
        self.assertEqual(result["receiver"]["account_no"], "XXX-X-XX996-5")
        self.assertEqual(result["confidence"]["sender_account"], 0.5)
        self.assertEqual(result["confidence"]["receiver_account"], 0.5)
        self.assertIn("sender_name", result["_fallback_meta"]["unclear_fields"])

    def test_keeps_any_ocr_visible_sender_name_including_full_names(self):
        result = parse_ocr_lines([
            "โอนเงินสำเร็จ",
            "จาก",
            "นาย สมชาย ใจดี",
            "กรุงไทย",
            "ไปยัง",
            "น.ส. ตัวอย่าง ผู้รับ",
            "ttb",
            "3,000.00",
        ])

        self.assertEqual(result["sender"]["name"], "นาย สมชาย ใจดี")
        self.assertEqual(result["receiver"]["name"], "น.ส. ตัวอย่าง ผู้รับ")

    def test_does_not_promote_ambiguous_ocr_timestamp_to_transaction_time(self):
        result = parse_ocr_lines([
            "17 0.8. 68, 15:51 u.",
            "รหัสอ้างอิง: 202506171502627774",
            "7,200.00",
        ])

        self.assertIsNone(result["transaction"]["date"])
        self.assertIsNone(result["transaction"]["time"])


if __name__ == "__main__":
    unittest.main()
