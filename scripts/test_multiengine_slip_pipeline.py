import unittest

from multiengine_slip_pipeline import parse_fields


class MultiEngineSlipParserTests(unittest.TestCase):
    def test_keeps_full_and_masked_names_as_ocr_visible_values(self):
        lines = [
            {"text": "นาย สมชาย ใจดี", "confidence": 0.91},
            {"text": "น.ส. ตัวอย่าง ผู้รับ", "confidence": 0.88},
            {"text": "XXX-X-XX558-9", "confidence": 0.9},
            {"text": "XXX-X-XX996-5", "confidence": 0.9},
            {"text": "7,200.00", "confidence": 0.95},
        ]

        result = parse_fields(lines, "qr")

        self.assertEqual(result.sender_name_raw, "นาย สมชาย ใจดี")
        self.assertEqual(result.receiver_name_raw, "น.ส. ตัวอย่าง ผู้รับ")

    def test_keeps_masked_sender_name_without_requiring_a_full_name(self):
        lines = [
            {"text": "สิบตรีณัฐชัย ร***", "confidence": 0.91},
            {"text": "น.ส. ตัวอย่าง ผู้รับ", "confidence": 0.88},
        ]

        result = parse_fields(lines, None)

        self.assertEqual(result.sender_name_raw, "สิบตรีณัฐชัย ร***")


if __name__ == "__main__":
    unittest.main()
