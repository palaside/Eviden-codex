import unittest
from decimal import Decimal
import net_detail as nd


def rec(i, ref, amt, page, date="2026-09-25", time="14:32", s="สมชาย ใจดี", r="สมหญิง รักดี",
        conf=0.95, status="validated", eligible=True):
    return {
        "metadata": {"id": i, "document_type": "SLIP", "source": {"page_number": page}},
        "extracted_data": {"amount": None if amt is None else f"{amt:,.2f}", "amount_number": amt,
                           "ref_id": ref, "transaction_date": date, "transaction_time": time,
                           "sender": {"name": s}, "recipient": {"name": r}},
        "confidence": {"overall": conf, "amount": conf, "ref_id": conf, "datetime": conf},
        "validation": {"overall_status": status, "calculation_eligible": eligible},
    }


class T(unittest.TestCase):
    def test_all_rules(self):
        data = [
            rec("a1", "REF001", 1000, 10),
            rec("a2", "REF001", 1000, 55),                      # dup of a1 by ref_id
            rec("b1", "REF002", 2000.50, 12),
            rec("c1", None, 3000, 20, conf=0.95),               # blurry ref, unique -> review
            rec("c2", None, 1000, 30),                          # blurry, matches a1 -> suspected dup
            rec("d1", "REF004", 500, 40, conf=0.80),            # low confidence -> review
            rec("e1", "REF005", None, 41),                      # amount unreadable -> review
            rec("f1", "REF006", 700, 42),
            rec("f2", "REF006", 750, 43),                       # same ref, diff amount -> conflict -> review
            rec("g1", "ref 001", 1000, 60),                     # ref normalised -> dup of a1
            rec("h1", "REF008", 100, 44, status="needs_review"),# flagged by validation
        ]
        flat, s = nd.reconcile(data, page_offset=4)
        st = {r["record_id"]: r["status"] for r in flat}
        self.assertEqual(st["a1"], "counted")
        self.assertEqual(st["a2"], "duplicate")
        self.assertEqual(st["g1"], "duplicate")
        self.assertEqual(st["b1"], "counted")
        self.assertEqual(st["c1"], "needs_review")
        self.assertEqual(st["c2"], "suspected_duplicate")
        self.assertEqual(st["d1"], "needs_review")
        self.assertEqual(st["e1"], "needs_review")
        self.assertEqual(st["f1"], "needs_review")
        self.assertEqual(st["f2"], "needs_review")
        self.assertEqual(st["h1"], "needs_review")
        self.assertEqual(s["net_amount"], Decimal("3000.50"))          # a1 + b1 only
        self.assertEqual(s["duplicate_amount"], Decimal("2000"))
        self.assertEqual(s["suspected_amount"], Decimal("1000"))
        self.assertEqual(s["needs_review_amount"], Decimal("3000") + 500 + 700 + 750 + 100)
        self.assertEqual(s["gross_amount"], Decimal("11050.50"))
        self.assertEqual({r["record_id"]: r["physical_page"] for r in flat}["a1"], 14)  # 10 + offset 4
        self.assertEqual(sum(1 for r in flat), s["total_records"])

    def test_legacy_example(self):
        legacy = nd.load_records("digital-evidence/slip_schema_example.json")
        flat, s = nd.reconcile(legacy, 0)
        self.assertEqual(len(flat), 1)
        self.assertEqual(flat[0]["status"], "counted")      # all confidences >= 0.85, has ref
        self.assertIn("page missing", flat[0]["reasons"])   # but cannot map physical_page
        self.assertIsNone(flat[0]["physical_page"])


if __name__ == "__main__":
    unittest.main()
