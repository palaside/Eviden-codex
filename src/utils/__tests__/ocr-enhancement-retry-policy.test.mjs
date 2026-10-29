import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateEnhancedOcrRetry,
  formatOcrRetryDiagnostic,
  shouldRetryOcrForMissingSlipFields,
  shouldRetryOcrWithEnhancement,
  shouldRetryRecipientName,
  selectRecipientRetryResult,
  selectRecipientConsensus,
  shouldUseEnhancedOcrForSlipFields,
  shouldUseEnhancedOcrResult,
} from "../ocr-enhancement-retry-policy.mjs";

test("evaluates the missing-field retry and emits a diagnostic from the same decision", () => {
  const decision = evaluateEnhancedOcrRetry({
    scope: "QR crop",
    trigger: "missing-fields",
    originalRegions: [{ amount: 5000, date: null, referenceNo: "REF1234" }],
    enhancedRegions: [{ amount: 5000, date: "2026-06-09", referenceNo: "REF1234" }],
    originalConfidence: 82,
    enhancedConfidence: 76,
    enhancedLineCount: 10,
  });
  assert.equal(decision.accepted, true);
  assert.match(decision.diagnostic, /เลือกผล OCR หลังปรับภาพ/);
  assert.match(decision.diagnostic, /82% -> 76%/);

  const rejected = evaluateEnhancedOcrRetry({
    scope: "full page",
    trigger: "low-confidence",
    originalConfidence: 41,
    enhancedConfidence: 40,
    enhancedLineCount: 2,
  });
  assert.equal(rejected.accepted, false);
  assert.match(rejected.diagnostic, /คงผล OCR ต้นฉบับ/);
  assert.doesNotMatch(rejected.diagnostic, /REF1234|5000|ณัฐชัย/);
});

test("formats review-only OCR retry diagnostics without OCR content", () => {
  assert.equal(formatOcrRetryDiagnostic({
    scope: "QR crop",
    trigger: "missing fields",
    accepted: true,
    originalConfidence: 82,
    enhancedConfidence: 76,
  }), "OCR retry (กรอบ QR): พบช่องสำคัญขาด; เลือกผล OCR หลังปรับภาพ (82% -> 76%). โปรดตรวจทาน");
  assert.equal(formatOcrRetryDiagnostic({
    scope: "full page",
    trigger: "low confidence or no text",
    accepted: false,
    originalConfidence: 41,
    enhancedConfidence: 40,
  }), "OCR retry (ทั้งหน้า): ความเชื่อมั่นต่ำหรือไม่พบบรรทัด; คงผล OCR ต้นฉบับ (41% -> 40%). โปรดตรวจทาน");
});

test("retries OCR only when confidence is poor or no text lines were found", () => {
  assert.equal(shouldRetryOcrWithEnhancement(54.99, 4), true);
  assert.equal(shouldRetryOcrWithEnhancement(80, 0), true);
  assert.equal(shouldRetryOcrWithEnhancement(55, 1), false);
  assert.equal(shouldRetryOcrWithEnhancement(90, 10), false);
  assert.equal(shouldRetryOcrWithEnhancement(Number.NaN, 1), true);
});

test("uses the enhanced OCR result only when it contains lines and meaningfully improves confidence", () => {
  assert.equal(shouldUseEnhancedOcrResult(40, 45, 3), true);
  assert.equal(shouldUseEnhancedOcrResult(40, 44.99, 3), false);
  assert.equal(shouldUseEnhancedOcrResult(40, 90, 0), false);
  assert.equal(shouldUseEnhancedOcrResult(Number.NaN, 70, 1), true);
});

test("retries a present recipient name when confidence is not strong enough", () => {
  assert.equal(shouldRetryRecipientName("OCR output", 0.92), true);
  assert.equal(shouldRetryRecipientName("OCR output", 0.96), false);
  assert.equal(shouldRetryRecipientName(null, 1), true);
});

test("only replaces a conflicting recipient name when focused OCR is materially more confident", () => {
  assert.deepEqual(selectRecipientRetryResult("วิณห์นิภา", 0.92, "จิณห์นิภา", 0.98), {
    name: "จิณห์นิภา", confidence: 0.98, conflict: true,
  });
  assert.deepEqual(selectRecipientRetryResult("วิณห์นิภา", 0.92, "จิณห์นิภา", 0.94), {
    name: "วิณห์นิภา", confidence: 0.92, conflict: true,
  });
  assert.deepEqual(selectRecipientRetryResult("วิณห์นิภา", 0.92, "วิณห์นิภา", 0.88), {
    name: "วิณห์นิภา", confidence: 0.92, conflict: false,
  });
});

test("selects a recipient name repeated by two independent OCR retries even when each retry is less confident", () => {
  assert.deepEqual(selectRecipientConsensus("วิณห์นิภา ประสาทเขตรการ", 0.92, [
    { name: "จิณห์นิภา ประสาทเขตรการ", confidence: 0.94 },
    { name: "จิณห์นิภา ประสาทเขตรการ", confidence: 0.90 },
  ]), {
    name: "จิณห์นิภา ประสาทเขตรการ", confidence: 0.94, conflict: true,
  });
});

test("retries a slip candidate when transaction cues exist but multiple key fields are missing", () => {
  assert.equal(shouldRetryOcrForMissingSlipFields([{
    amount: 5000,
    referenceNo: "REF1234",
    date: null,
    time: null,
    bankName: "ธนาคารกรุงไทย",
    senderName: null,
    receiverName: null,
    senderAccount: "xxx1234",
    receiverAccount: "xxx5678",
  }]), true);
});

test("retries a QR-anchored crop when OCR reads the QR payload but no slip fields", () => {
  assert.equal(shouldRetryOcrForMissingSlipFields([], false, true), true);
  assert.equal(shouldRetryOcrForMissingSlipFields([], false, false), false);
});

test("limits the field-driven retry to one attempt per input image", () => {
  const incomplete = [{
    amount: 5000, referenceNo: "REF1234", date: null, time: null, bankName: "ธนาคารกรุงไทย",
    senderName: null, receiverName: null, senderAccount: "xxx1234", receiverAccount: "xxx5678",
  }];
  assert.equal(shouldRetryOcrForMissingSlipFields(incomplete), true);
  assert.equal(shouldRetryOcrForMissingSlipFields(incomplete, true), false);
});

test("does not retry for complete candidates or text without a slip anchor", () => {
  assert.equal(shouldRetryOcrForMissingSlipFields([{
    amount: 5000, referenceNo: "REF1234", date: "2026-06-09", time: "14:45",
    bankName: "ธนาคารกรุงไทย", senderName: "นาย ก", receiverName: "นาง ข",
    senderAccount: "xxx1234", receiverAccount: "xxx5678",
  }]), false);
  assert.equal(shouldRetryOcrForMissingSlipFields([{
    amount: null, referenceNo: null, bankName: null, date: null, time: null,
    senderName: null, receiverName: null, senderAccount: null, receiverAccount: null,
  }]), false);
  assert.equal(shouldRetryOcrForMissingSlipFields([{
    amount: 5000, referenceNo: "REF1234", date: "2026-06-09", time: "14:45",
    bankName: "ธนาคารกรุงไทย", senderName: "นาย ก", receiverName: "นาง ข",
    senderAccount: "xxx1234", receiverAccount: null,
  }]), false);
});

test("accepts enhanced OCR when it adds key fields without a material confidence drop", () => {
  const original = [{ amount: 5000, referenceNo: "REF1234", date: null, time: null, bankName: null,
    senderName: null, receiverName: null, senderAccount: null, receiverAccount: null }];
  const improved = [{ ...original[0], date: "2026-06-09", time: "14:45", bankName: "ธนาคารกรุงไทย" }];
  assert.equal(shouldUseEnhancedOcrForSlipFields(original, improved, 82, 76, 10), true);
  assert.equal(shouldUseEnhancedOcrForSlipFields(original, improved, 82, 71, 10), false);
  assert.equal(shouldUseEnhancedOcrForSlipFields(original, original, 82, 82, 10), false);
});

test("compares structured slip coverage instead of unrelated QR text confidence", () => {
  const improved = [{ amount: 1000, referenceNo: "REF-1234567890", receiverName: "นางสาว ตัวอย่าง" }];
  assert.equal(shouldUseEnhancedOcrForSlipFields([], improved, 98, 62, 8), true);
});
