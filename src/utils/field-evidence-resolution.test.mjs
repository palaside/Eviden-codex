import assert from "node:assert/strict";
import test from "node:test";
import { mergeFieldObservations, validateFieldResult } from "./field-evidence-resolution.mjs";

test("keeps exact repeated observations as reviewable consensus", () => {
  const result = mergeFieldObservations("receiverName", [
    { value: "น.ส. จิณห์นิภา ประสาทเขตรการ", rawText: "น.ส. จิณห์นิภา ประสาทเขตรการ", confidence: 0.92, source: "gemini" },
    { value: "น.ส. จิณห์นิภา ประสาทเขตรการ", rawText: "น.ส. จิณห์นิภา ประสาทเขตรการ", confidence: 0.88, source: "ocr" },
  ]);
  assert.equal(result.value, "น.ส. จิณห์นิภา ประสาทเขตรการ");
  assert.equal(result.status, "review");
  assert.equal(result.conflict, false);
  assert.equal(result.reviewStatus, "human_review_required");
});

test("preserves conflicting OCR values instead of choosing one", () => {
  const result = mergeFieldObservations("receiverName", [
    { value: "วิณห์นิภา ประสาทเขตรการ", rawText: "วิณห์นิภา ประสาทเขตรการ", confidence: 0.93, source: "ocr" },
    { value: "จิณห์นิภา ประสาทเขตรการ", rawText: "จิณห์นิภา ประสาทเขตรการ", confidence: 0.90, source: "gemini" },
  ]);
  assert.equal(result.value, null);
  assert.equal(result.status, "ocr_conflict");
  assert.equal(result.conflict, true);
  assert.deepEqual(result.alternatives.map((item) => item.value), [
    "วิณห์นิภา ประสาทเขตรการ",
    "จิณห์นิภา ประสาทเขตรการ",
  ]);
});

test("human correction is separate from OCR conflict and remains review-only", () => {
  const result = mergeFieldObservations("receiverName", [
    { value: "วิณห์นิภา", rawText: "วิณห์นิภา", confidence: 0.93, source: "ocr" },
    { value: "จิณห์นิภา", rawText: "จิณห์นิภา", confidence: 0.90, source: "gemini" },
  ], { humanValue: "จิณห์นิภา", reviewedBy: "human" });
  assert.equal(result.value, "จิณห์นิภา");
  assert.equal(result.ocrValue, null);
  assert.equal(result.status, "ocr_conflict");
  assert.equal(result.reviewStatus, "human_reviewed");
  assert.equal(result.confirmed, false);
});

test("rejects invalid field results without inventing a value", () => {
  assert.deepEqual(validateFieldResult({ field: "amount", value: -1, confidence: 1.4, sourceBounds: null }), {
    valid: false,
    errors: ["amount must be positive", "confidence must be between 0 and 1", "sourceBounds is required"],
  });
});
