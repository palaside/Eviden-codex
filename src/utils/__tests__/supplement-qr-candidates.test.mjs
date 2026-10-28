import assert from "node:assert/strict";
import test from "node:test";
import { combineQrAndOcrSlipCandidates } from "../supplement-qr-candidates.ts";

const candidate = ({ x, y, width, height, amount = null, fee = null, referenceNo = null, bankName = null, senderName = null, senderAccount = null, receiverName = null, receiverNameConfidence = 0, date = null, time = null, warning = "candidate" }) => ({
  data: {
    bank: { name: bankName, confidence: bankName ? 0.9 : 0 },
    transaction: { amount, fee, reference_no: referenceNo, date, time },
    sender: { name: senderName, account_no: senderAccount, bank: null },
    receiver: { name: receiverName },
    confidence: { amount: amount ? 0.9 : 0, reference_no: referenceNo ? 0.9 : 0, sender_name: senderName ? 0.91 : 0, sender_account: senderAccount ? 0.9 : 0, receiver_name: receiverNameConfidence, receiver_account: 0, date: date ? 0.9 : 0, time: time ? 0.9 : 0 },
    raw_text: [warning],
    warnings: [warning],
  },
  bounds: { x, y, width, height },
  cropDataUrl: `data:image/png;base64,${warning}`,
});

test("preserves a zero fee extracted by OCR when supplementing a QR candidate", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, amount: 5000, warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, fee: 0, warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.transaction.fee, 0);
});

test("does not replace an existing QR fee with an OCR value", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, fee: 2, warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, fee: 0, warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.transaction.fee, 2);
});

test("flags amount conflicts between QR and OCR without changing the QR amount", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, amount: 5000, warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, amount: 500, warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.transaction.amount, 5000);
  assert.ok(combined.data.warnings.some((warning) => /CRITICAL.*ยอดเงิน.*QR.*OCR/i.test(warning)));
  assert.equal(combined.isConfirmed, undefined);
});

test("flags bank conflicts between QR and OCR without changing the QR bank", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, bankName: "ธนาคารกรุงไทย (KTB)", warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, bankName: "ธนาคารไทยพาณิชย์", warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.bank.name, "ธนาคารกรุงไทย (KTB)");
  assert.ok(combined.data.warnings.some((warning) => /CRITICAL.*ธนาคาร.*QR.*OCR/i.test(warning)));
  assert.equal(combined.isConfirmed, undefined);
});

test("does not flag equivalent bank aliases as a conflict", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, bankName: "ธนาคารกรุงไทย (KTB)", warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, bankName: "Krungthai", warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.warnings.some((warning) => /CRITICAL/.test(warning)), false);
});

test("does not report a bank conflict when the QR bank is unidentified", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, bankName: "ตรวจพบ QR e-Slip", warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, bankName: "ธนาคารไทยพาณิชย์", warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.warnings.some((warning) => /CRITICAL.*ธนาคาร/.test(warning)), false);
});

test("recognizes the full English Government Savings Bank name in conflict checks", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, bankName: "Government Savings Bank", warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, bankName: "ธนาคารกรุงไทย", warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.ok(combined.data.warnings.some((warning) => /CRITICAL.*ธนาคาร/.test(warning)));
});

test("does not infer a bank code from letters spanning words in an unknown bank label", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, bankName: "Savings Bank Group", warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, bankName: "ธนาคารกรุงไทย", warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.warnings.some((warning) => /CRITICAL.*ธนาคาร/.test(warning)), false);
});

test("supplements only missing QR fields from the OCR region containing its QR", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, amount: 2000, warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, amount: 100, referenceNo: "REF-1", bankName: "ธนาคารกรุงไทย", receiverName: "น.ส. ตัวอย่าง ผู้รับ", receiverNameConfidence: 0.88, date: "2025-05-31", time: "20:04", warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.transaction.amount, 2000);
  assert.equal(combined.data.transaction.reference_no, "REF-1");
  assert.equal(combined.data.transaction.date, "2025-05-31");
  assert.equal(combined.data.transaction.time, "20:04");
  assert.equal(combined.data.confidence.date, 0.9);
  assert.equal(combined.data.confidence.time, 0.9);
  assert.equal(combined.data.bank.name, "ธนาคารกรุงไทย");
  assert.equal(combined.data.receiver.name, "น.ส. ตัวอย่าง ผู้รับ");
  assert.equal(combined.data.confidence.receiver_name, 0.88);
  assert.deepEqual(combined.data.raw_text, ["qr", "ocr"]);
  assert.equal(combined.isConfirmed, undefined);
});

test("merges sender name and party accounts from position-matched OCR without overriding QR data", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, amount: 5000, senderName: "ชื่อจาก QR", warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, senderName: "ชื่อจาก OCR", senderAccount: "xxx-1234", receiverName: "ผู้รับ OCR", receiverNameConfidence: 0.9, warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.sender.name, "ชื่อจาก QR");
  assert.equal(combined.data.sender.account_no, "xxx-1234");
  assert.equal(combined.data.receiver.name, "ผู้รับ OCR");
  assert.equal(combined.data.confidence.sender_name, 0.91);
  assert.equal(combined.data.confidence.sender_account, 0.9);
});

test("keeps the OCR trace fields in sync when QR merging fills a missing recipient", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, amount: 5000, warning: "qr" });
  qr.ocrDiagnosticTrace = { regions: [{ receiverName: null }] };
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, amount: 5000, receiverName: "ผู้รับจาก OCR", receiverNameConfidence: 0.9, warning: "ocr" });
  ocr.ocrDiagnosticTrace = { regions: [{ receiverName: "ผู้รับจาก OCR" }] };

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.receiver.name, "ผู้รับจาก OCR");
  assert.equal(combined.ocrDiagnosticTrace.regions[0].receiverName, "ผู้รับจาก OCR");
});

test("never overwrites a recipient name already extracted from QR data", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, receiverName: "ชื่อจาก QR", receiverNameConfidence: 0.95, warning: "qr" });
  const ocr = candidate({ x: 10, y: 10, width: 100, height: 120, receiverName: "ชื่อจาก OCR", receiverNameConfidence: 0.7, warning: "ocr" });

  const [combined] = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(combined.data.receiver.name, "ชื่อจาก QR");
  assert.equal(combined.data.confidence.receiver_name, 0.95);
});

test("keeps unmatched OCR as a separate pending candidate and never overwrites QR values", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, amount: 2000, referenceNo: "QR-REF", warning: "qr" });
  const unmatchedOcr = candidate({ x: 300, y: 300, width: 80, height: 100, amount: 100, referenceNo: "OCR-REF", warning: "ocr" });

  const results = combineQrAndOcrSlipCandidates([qr], [unmatchedOcr]);

  assert.equal(results.length, 2);
  assert.equal(results[0].data.transaction.amount, 2000);
  assert.equal(results[0].data.transaction.reference_no, "QR-REF");
  assert.equal(results[1].data.transaction.amount, 100);
  assert.equal(results[1].isConfirmed, undefined);
});

test("joins a uniquely labeled OCR reference to its QR when the OCR field parser missed it", () => {
  const qr = candidate({ x: 700, y: 90, width: 28, height: 28, amount: 3000, referenceNo: "A8bf6eddda8fb4300", warning: "qr" });
  const ocr = candidate({
    x: 80, y: 700, width: 650, height: 60, amount: 3000, warning: "ocr",
  });
  ocr.data.raw_text = ["รหัสอ้างอิง: A8bf6eddda8fb4300", "จำนวนเงิน 3,000.00 บาท"];

  const results = combineQrAndOcrSlipCandidates([qr], [ocr]);

  assert.equal(results.length, 1);
  assert.equal(results[0].data.transaction.amount, 3000);
  assert.ok(results[0].data.warnings.includes("ระบบจับคู่ QR กับข้อความ OCR จาก Ref ID ที่มีป้ายกำกับตรงกัน; โปรดตรวจข้อมูลก่อนยืนยัน"));
});

test("joins a sole same-amount successful slip OCR to its QR when OCR misreads the labeled reference", () => {
  const qr = candidate({ x: 700, y: 90, width: 28, height: 28, amount: null, referenceNo: "A8bf6e4dda8fb4300", bankName: "ตรวจพบ QR e-Slip", warning: "qr" });
  const ocr = candidate({ x: 80, y: 700, width: 650, height: 60, amount: 2000, bankName: "ธนาคารกรุงไทย", receiverName: "น.ส. ตัวอย่าง ผู้รับ", warning: "ocr" });
  ocr.data.raw_text = ["โอนเงินสำเร็จ", "รหัสอ้างอิง A8bf6eddda8fb4300", "จำนวนเงิน 2,000.00 บาท"];
  const unrelated = candidate({ x: 20, y: 900, width: 240, height: 60, amount: 7200, warning: "unrelated-ocr" });
  unrelated.data.raw_text = ["จำนวนเงิน 7,200.00 บาท"];

  const results = combineQrAndOcrSlipCandidates([qr], [ocr, unrelated]);

  assert.equal(results.length, 2);
  assert.equal(results[0].data.transaction.reference_no, "A8bf6e4dda8fb4300");
  assert.equal(results[0].data.receiver.name, "น.ส. ตัวอย่าง ผู้รับ");
  assert.ok(results[0].data.warnings.some((warning) => /CRITICAL.*Ref.*QR.*OCR/u.test(warning)));
  assert.equal(results[0].isConfirmed, undefined);
  assert.equal(results[1].data.transaction.amount, 7200);
});

test("associates structured slip OCR with a unique QR when its nonstandard payload has no parsed reference", () => {
  const qr = candidate({ x: 700, y: 90, width: 28, height: 28, amount: null, warning: "qr" });
  qr.data.raw_text = ["0038000600000101030060217A8bf6e4dda8fb43005102TH9104A4F8"];
  const ocr = candidate({ x: 80, y: 700, width: 650, height: 60, amount: 2000, receiverName: "น.ส. ตัวอย่าง ผู้รับ", warning: "ocr" });
  ocr.data.raw_text = ["รหัสอ้างอิง A8bf6eddda8fb4300", "จำนวนเงิน 2,000.00 บาท"];
  const unrelated = candidate({ x: 20, y: 900, width: 240, height: 60, amount: 7200, warning: "unrelated-ocr" });
  unrelated.data.raw_text = ["จำนวนเงิน 7,200.00 บาท"];

  const results = combineQrAndOcrSlipCandidates([qr], [ocr, unrelated]);

  assert.equal(results.length, 2);
  assert.equal(results[0].data.transaction.amount, 2000);
  assert.equal(results[0].data.receiver.name, "น.ส. ตัวอย่าง ผู้รับ");
  assert.equal(results[0].data.transaction.reference_no, null);
  assert.ok(results[0].data.warnings.some((warning) => /QR ไม่มี Ref ที่ parser แยกได้/u.test(warning)));
  assert.equal(results[1].data.transaction.amount, 7200);
});

test("does not let a fieldless QR-position OCR crop block structured slip OCR", () => {
  const qr = candidate({ x: 700, y: 90, width: 28, height: 28, warning: "qr" });
  const fieldlessQrCrop = candidate({ x: 680, y: 70, width: 70, height: 70, warning: "qr-crop-no-fields" });
  const structuredOcr = candidate({ x: 80, y: 700, width: 650, height: 60, amount: 2000, receiverName: "น.ส. ตัวอย่าง ผู้รับ", warning: "ocr" });
  structuredOcr.data.raw_text = ["รหัสอ้างอิง A8bf6eddda8fb4300", "จำนวนเงิน 2,000.00 บาท"];

  const results = combineQrAndOcrSlipCandidates([qr], [fieldlessQrCrop, structuredOcr]);

  assert.equal(results.length, 1);
  assert.equal(results[0].data.transaction.amount, 2000);
  assert.equal(results[0].data.receiver.name, "น.ส. ตัวอย่าง ผู้รับ");
  assert.ok(results[0].data.warnings.some((warning) => /QR ไม่มี Ref ที่ parser แยกได้/u.test(warning)));
});

test("keeps ambiguous OCR regions separate instead of choosing one automatically", () => {
  const qr = candidate({ x: 40, y: 50, width: 20, height: 20, warning: "qr" });
  const ocrA = candidate({ x: 0, y: 0, width: 120, height: 120, amount: 100, warning: "ocr-a" });
  const ocrB = candidate({ x: 10, y: 10, width: 110, height: 110, amount: 200, warning: "ocr-b" });

  const results = combineQrAndOcrSlipCandidates([qr], [ocrA, ocrB]);

  assert.equal(results.length, 3);
  assert.deepEqual(results.map((item) => item.data.raw_text[0]), ["qr", "ocr-a", "ocr-b"]);
});
