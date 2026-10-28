import assert from "node:assert/strict";
import test from "node:test";
import { finalizeSlipCandidates } from "../finalize-slip-candidates.mjs";

function candidate(data, bounds = { x: 90, y: 90, width: 20, height: 20 }) {
  return { data, bounds, cropDataUrl: "data:image/png;base64,test", ocrTextBoxes: [] };
}

function data(overrides = {}) {
  return {
    document_type: "bank_transfer_slip",
    bank: { name: "ธนาคารกรุงไทย", confidence: 0.9 },
    transaction: { date: null, time: null, amount: 5000, currency: "THB", fee: null, reference_no: "REF-1", transaction_id: "REF-1", note: null },
    sender: { name: "นาย สมชาย ใจดี", bank: null, account_no: null },
    receiver: { name: "น.ส. สมหญิง รักดี", bank: null, account_no: null },
    confidence: { sender_name: 0.9, receiver_name: 0.9 },
    raw_text: ["นาย สมชาย ใจดี", "น.ส. สมหญิง รักดี"],
    warnings: ["qr-extraction"],
    ...overrides,
  };
}

test("finalizes QR-only fallback with normalized names and review warnings", () => {
  const source = candidate(data());
  const [result] = finalizeSlipCandidates([source], []);

  assert.equal(result.data.sender.name, "สมชาย ใจดี");
  assert.equal(result.data.receiver.name, "สมหญิง รักดี");
  const missingWarning = result.data.warnings.find((warning) => warning.startsWith("ข้อมูลที่ยังอ่านไม่ได้และต้องตรวจทาน:"));
  assert.ok(missingWarning?.includes("วันที่"));
  assert.equal(missingWarning?.includes("ชื่อผู้โอน"), false);
  assert.equal(missingWarning?.includes("ชื่อผู้รับ"), false);
  assert.deepEqual(result.data.raw_text, source.data.raw_text);
  assert.equal(result.data.transaction.amount, 5000);
});

test("finalizes an OCR-enriched QR candidate and retains recovered fields", () => {
  const qr = candidate(data());
  const ocr = candidate(data({
    bank: { name: "ธนาคารกรุงไทย", confidence: 0.95 },
    transaction: { date: "2025-06-09", time: "14:45", amount: 5000, currency: "THB", fee: 0, reference_no: "REF-1", transaction_id: "REF-1", note: "โอนเงิน" },
    sender: { name: "นาย สมชาย ใจดี", bank: "ธนาคาร A", account_no: "XXX-1234" },
    receiver: { name: "น.ส. สมหญิง รักดี", bank: "ธนาคาร B", account_no: "XXX-5678" },
    warnings: [],
  }), { x: 0, y: 0, width: 200, height: 200 });

  const [result] = finalizeSlipCandidates([qr], [ocr]);

  assert.equal(result.data.sender.name, "สมชาย ใจดี");
  assert.equal(result.data.receiver.name, "สมหญิง รักดี");
  assert.equal(result.data.sender.account_no, "XXX-1234");
  assert.equal(result.data.receiver.account_no, "XXX-5678");
  assert.equal(result.data.transaction.date, "2025-06-09");
  const missingWarning = result.data.warnings.find((warning) => warning.startsWith("ข้อมูลที่ยังอ่านไม่ได้และต้องตรวจทาน:"));
  assert.equal(missingWarning, "ข้อมูลที่ยังอ่านไม่ได้และต้องตรวจทาน: บันทึกช่วยจำ");
});

test("keeps unmatched OCR candidates as separately reviewable candidates", () => {
  const qr = candidate(data(), { x: 10, y: 10, width: 20, height: 20 });
  const ocr = candidate(data(), { x: 500, y: 500, width: 100, height: 100 });

  const results = finalizeSlipCandidates([qr], [ocr]);

  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.data.warnings.some((warning) => warning.startsWith("ข้อมูลที่ยังอ่านไม่ได้และต้องตรวจทาน:"))));
});

test("collapses repeated detections of one reference at the same image region and keeps the richer extraction", () => {
  const sparse = candidate(data({
    transaction: { date: null, time: null, amount: null, currency: "THB", fee: null, reference_no: "REF-1", transaction_id: "REF-1", note: null },
    sender: { name: null, bank: null, account_no: null },
    receiver: { name: null, bank: null, account_no: null },
    raw_text: ["QR REF-1"],
  }));
  const rich = candidate(data({
    transaction: { date: "2025-06-20", time: "14:15", amount: 3000, currency: "THB", fee: 0, reference_no: "REF-1", transaction_id: "REF-1", note: null },
    raw_text: ["สลิป REF-1 3,000 บาท"],
  }), { x: 91, y: 90, width: 20, height: 20 });

  const [result] = finalizeSlipCandidates([sparse, rich], []);

  assert.equal(finalizeSlipCandidates([sparse, rich], []).length, 1);
  assert.equal(result.data.transaction.amount, 3000);
  assert.equal(result.data.transaction.date, "2025-06-20");
  assert.ok(result.data.warnings.some((warning) => /การตรวจจับซ้ำที่ Ref และบริเวณภาพเดียวกัน/u.test(warning)));
});

test("keeps same-reference candidates at distinct image locations for manual duplicate review", () => {
  const first = candidate(data());
  const second = candidate(data(), { x: 500, y: 500, width: 20, height: 20 });

  assert.equal(finalizeSlipCandidates([first, second], []).length, 2);
});

test("preserves OCR diagnostic trace when repeated detections consolidate", () => {
  const trace = { attempts: [{ id: "attempt-a" }], regions: [] };
  const first = candidate(data(), { x: 90, y: 90, width: 20, height: 20 });
  first.ocrDiagnosticTrace = trace;
  const duplicate = candidate(data(), { x: 91, y: 90, width: 20, height: 20 });
  duplicate.ocrDiagnosticTrace = { attempts: [{ id: "attempt-b" }], regions: [] };

  const [result] = finalizeSlipCandidates([first, duplicate], []);

  assert.deepEqual(result.ocrDiagnosticTrace, trace);
});
