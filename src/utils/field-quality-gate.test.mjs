import test from "node:test";
import assert from "node:assert/strict";
import { assessFieldQuality, fieldQualitySummary } from "./field-quality-gate.mjs";

test("does not trust OCR when the field region is outside the source", () => {
  const result = assessFieldQuality({ field: "receiver_name", value: "ชื่อ", rawOcr: "ชื่อ", confidence: 0.99, bounds: { x: 95, y: 0, width: 20, height: 20 }, sourceDimensions: { width: 100, height: 100 } });
  assert.equal(result.visual_quality, "pass");
  assert.equal(result.region_quality, "fail");
  assert.equal(result.review_status, "review_required");
});

test("preserves conflicting OCR alternatives instead of selecting one", () => {
  const result = assessFieldQuality({ field: "receiver_name", value: "จิณห์", alternatives: ["จิณห์", "วิณห์"], confidence: 0.95, bounds: { x: 1, y: 1, width: 40, height: 20 }, sourceDimensions: { width: 100, height: 100 } });
  assert.equal(result.recognition_quality, "conflict");
  assert.deepEqual(result.alternatives, ["จิณห์", "วิณห์"]);
});

test("summary remains review-only even when every field is readable", () => {
  const field = assessFieldQuality({ field: "amount", value: "800", confidence: 0.95, bounds: { x: 1, y: 1, width: 40, height: 20 }, sourceDimensions: { width: 100, height: 100 } });
  assert.deepEqual(fieldQualitySummary([field]), { visual_quality: "pass", region_quality: "pass", recognition_quality: "pass", review_status: "review_required" });
});
