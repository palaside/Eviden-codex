import test from "node:test";
import assert from "node:assert/strict";
import { auditTraceCandidates } from "./e2e-field-audit.mjs";

test("field audit requires crop hash, coordinates, raw OCR metadata, and review gate", () => {
  const result = auditTraceCandidates([{
    sourceSha256: "a".repeat(64),
    needsReview: true,
    fieldCrops: [{
      field: "amount",
      bounds: { x: 1, y: 2, width: 3, height: 4 },
      cropSha256: "b".repeat(64),
      rawOcr: "15,000.00",
      confidence: 0.9,
      review_status: "review_required",
    }],
  }]);
  assert.deepEqual(result, {
    candidateCount: 1,
    fieldCount: 1,
    sourceSha256Present: 1,
    completeFieldEvidence: 1,
    reviewRequiredCandidates: 1,
    passed: true,
  });
});

test("field audit fails when a crop loses provenance", () => {
  const result = auditTraceCandidates([{
    sourceSha256: "a".repeat(64),
    needsReview: true,
    fieldCrops: [{ field: "amount", bounds: null, cropSha256: null, review_status: "review_required" }],
  }]);
  assert.equal(result.passed, false);
  assert.equal(result.completeFieldEvidence, 0);
});

test("field audit accepts the trace candidate source.sha256 shape", () => {
  const result = auditTraceCandidates([{
    source: { sha256: "a".repeat(64) },
    needsReview: true,
    fieldCrops: [{
      field: "receiverName",
      bounds: { x: 10, y: 20, width: 30, height: 40 },
      cropSha256: "b".repeat(64),
      rawOcr: "น.ส. ตัวอย่าง",
      confidence: 0.8,
      review_status: "review_required",
    }],
  }]);
  assert.equal(result.sourceSha256Present, 1);
  assert.equal(result.passed, true);
});
