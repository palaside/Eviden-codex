import assert from "node:assert/strict";
import test from "node:test";
import { applyMissingSlipReviewWarnings } from "../slip-ocr-analysis.ts";

const warningPrefix = "ข้อมูลที่ยังอ่านไม่ได้และต้องตรวจทาน:";

function qrOnlyData(overrides = {}) {
  return {
    document_type: "bank_transfer_slip",
    bank: { name: "ธนาคารกรุงไทย", confidence: 0.9 },
    transaction: {
      date: null, time: null, amount: 5000, currency: "THB", fee: null,
      reference_no: "REF-1", transaction_id: "REF-1", note: null,
    },
    sender: { name: null, bank: null, account_no: null },
    receiver: { name: null, bank: null, account_no: null },
    confidence: {},
    raw_text: ["qr payload"],
    warnings: ["qr-extraction"],
    ...overrides,
  };
}

test("adds field-level review warnings to QR-only candidates without inventing values", () => {
  const original = qrOnlyData();
  const result = applyMissingSlipReviewWarnings(original);

  assert.equal(result.transaction.amount, 5000);
  assert.equal(result.transaction.date, null);
  assert.equal(result.sender.name, null);
  assert.deepEqual(result.raw_text, ["qr payload"]);
  assert.ok(result.warnings.includes("qr-extraction"));
  assert.ok(result.warnings.some((warning) => warning.startsWith(warningPrefix)
    && warning.includes("วันที่")
    && warning.includes("ชื่อผู้โอน")
    && warning.includes("ชื่อผู้รับ")
    && warning.includes("บันทึกช่วยจำ")));
  assert.deepEqual(original.warnings, ["qr-extraction"]);
});

test("does not flag fields already recovered from QR and OCR", () => {
  const complete = qrOnlyData({
    transaction: {
      date: "2025-06-09", time: "14:45", amount: 5000, currency: "THB", fee: 0,
      reference_no: "REF-1", transaction_id: "REF-1", note: "transfer",
    },
    sender: { name: "ผู้โอน", bank: "ธนาคาร A", account_no: "XXX-1234" },
    receiver: { name: "ผู้รับ", bank: "ธนาคาร B", account_no: "XXX-5678" },
    confidence: {
      date: 0.95, time: 0.94, amount: 0.96, reference_no: 0.95,
      sender_name: 0.93, receiver_name: 0.92, sender_account: 0.9, receiver_account: 0.9,
    },
  });

  const result = applyMissingSlipReviewWarnings(complete);

  assert.equal(result.warnings.some((warning) => warning.startsWith(warningPrefix)), false);
  assert.deepEqual(result._fallback_meta, { needs_human_review: false, unclear_fields: [] });
});

test("replaces its previous warning on repeated application", () => {
  const once = applyMissingSlipReviewWarnings(qrOnlyData());
  const twice = applyMissingSlipReviewWarnings(once);

  assert.equal(twice.warnings.filter((warning) => warning.startsWith(warningPrefix)).length, 1);
});

test("adds structured review metadata for missing or low-confidence fields without changing values", () => {
  const original = qrOnlyData({
    transaction: {
      date: null, time: null, amount: 5000, currency: "THB", fee: null,
      reference_no: "REF-1", transaction_id: "REF-1", note: null,
    },
    sender: { name: "ชื่อที่ OCR อ่านได้", bank: "ธนาคาร A", account_no: null },
    receiver: { name: null, bank: null, account_no: null },
    confidence: {
      date: 0, time: 0, amount: 0.96, reference_no: 0.95,
      sender_name: 0.72, receiver_name: 0,
      sender_account: 0, receiver_account: 0,
    },
  });

  const result = applyMissingSlipReviewWarnings(original);

  assert.deepEqual(result._fallback_meta, {
    needs_human_review: true,
    unclear_fields: [
      "transaction.date",
      "transaction.time",
      "sender.name",
      "receiver.name",
      "receiver.bank",
      "transaction.note",
    ],
  });
  assert.equal(result.sender.name, "ชื่อที่ OCR อ่านได้");
  assert.equal(result.transaction.amount, 5000);
});
