# -*- coding: utf-8 -*-
import re
import unittest
from typing import List, Tuple

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "vendor"))
from amounts import find_amount_candidates

class TestP2AmountCandidates(unittest.TestCase):
    def test_case_1_no_decimal(self):
        results = find_amount_candidates("โอนเงินสำเร็จ จำนวนเงิน 5000 บาท")
        self.assertTrue(any(val == "5,000.00" and src == "amount_label" for val, src in results))

    def test_case_2_qr_only(self):
        results = find_amount_candidates("00020101021229370016A00000067701011154071500.005802TH")
        self.assertTrue(any(val == "1,500.00" and src == "QR_Tag54" for val, src in results))

    def test_case_3_fee_separated(self):
        results = find_amount_candidates("จำนวนเงิน 2,500.00 บาท ค่าธรรมเนียม 0.00 บาท")
        labels = [src for val, src in results]
        self.assertIn("amount_label", labels)
        self.assertIn("fee", labels)

    def test_case_4_long_reference_id_ignored(self):
        results = find_amount_candidates("จำนวนเงิน 1,200.00 รหัสอ้างอิง 2026091312345678")
        vals = [val for val, src in results]
        self.assertIn("1,200.00", vals)
        self.assertNotIn("20,260,913,123,456.78", vals)


if __name__ == "__main__":
    unittest.main()
