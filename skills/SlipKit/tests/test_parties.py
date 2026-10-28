# -*- coding: utf-8 -*-
import unittest
from typing import List, Dict, Any

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "vendor"))
from parties import assign_parties

class TestP3AssignParties(unittest.TestCase):
    def test_case_1_clear_cues(self):
        res = assign_parties(["นางสาว ใจดี มีสุข", "นาย สมชาย เข็มกลัด"],
                             "โอนจาก นาย สมชาย เข็มกลัด ไปยัง นางสาว ใจดี มีสุข จำนวน 500 บาท")
        self.assertEqual(res["sender_name"], "นาย สมชาย เข็มกลัด")
        self.assertEqual(res["receiver_name"], "นางสาว ใจดี มีสุข")
        self.assertFalse(res["needs_review"])

    def test_case_2_no_cues_fallback_position(self):
        res = assign_parties(["นาย สมชาย เข็มกลัด", "นาย ณัฐชัย รักษาวงษ์"],
                             "นาย สมชาย เข็มกลัด 123-4-56789-0 นาย ณัฐชัย รักษาวงษ์ 987-6-54321-0")
        self.assertEqual(res["sender_name"], "นาย สมชาย เข็มกลัด")
        self.assertEqual(res["receiver_name"], "นาย ณัฐชัย รักษาวงษ์")
        self.assertTrue(res["needs_review"])

    def test_case_3_single_candidate(self):
        res = assign_parties(["นาย สมชาย เข็มกลัด"], "ทำรายการสำเร็จ นาย สมชาย เข็มกลัด จำนวน 100 บาท")
        self.assertTrue(res["needs_review"])


if __name__ == "__main__":
    unittest.main()
