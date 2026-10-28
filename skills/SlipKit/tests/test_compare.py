# -*- coding: utf-8 -*-
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "vendor"))
from compare import extract_branch, load_printed_log, is_printed, build_excel


class TestCompare(unittest.TestCase):
    def test_branch(self):
        self.assertEqual(extract_branch("โอนที่สาขา พระราม 4"), "พระราม 4")

    def test_branch_none(self):
        self.assertIsNone(extract_branch("จำนวนเงิน 100 บาท"))

    def test_printed_log(self):
        p = Path(__file__).parent / "printed_tmp.txt"
        p.write_text("A4_IMG_ (95).PNG\nnotes.txt\n", encoding="utf-8")
        s = load_printed_log(str(p))
        self.assertTrue(is_printed("A4_IMG_ (95).png", s))
        self.assertFalse(is_printed("other.jpg", s))
        p.unlink()

    def test_excel(self):
        out = str(Path(__file__).parent / "rep_tmp.xlsx")
        build_excel([{"Filename": "a.png", "Timestamp": "2025-01-01", "Amount": "100",
                      "Payer": "นาย ก", "Reference": "X1", "Branch": "สยาม", "Printed": "No"}], out)
        self.assertTrue(os.path.exists(out))
        os.remove(out)


if __name__ == "__main__":
    unittest.main()
