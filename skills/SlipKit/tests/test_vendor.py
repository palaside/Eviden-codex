# -*- coding: utf-8 -*-
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "vendor"))
from pii_dedup import contains_pii, DuplicateGuard, text_fingerprint


class TestVendor(unittest.TestCase):
    def test_pii_phone_id(self):
        self.assertTrue(contains_pii("โทร 0812345678"))
        self.assertTrue(contains_pii("เลข 1234567890123"))
        self.assertFalse(contains_pii("จำนวนเงิน 1,500.00 บาท"))

    def test_txid_guard(self):
        g = DuplicateGuard()
        self.assertFalse(g.check_txid("ABC123"))
        self.assertTrue(g.check_txid("ABC123"))

    def test_text_fp_dup_across_encoding(self):
        g = DuplicateGuard()
        dup, _ = g.check_text("นาย สมชาย  โอน 1,500.00", "a")
        self.assertFalse(dup)
        dup, of = g.check_text("นายสมชายโอน1,500.00", "b")
        self.assertTrue(dup)


if __name__ == "__main__":
    unittest.main(verbosity=1)
