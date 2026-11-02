import test from "node:test";
import assert from "node:assert/strict";
import { resolveBankTextEvidence } from "./bank-evidence.mjs";

test("uses OCR bank line confidence instead of inventing confidence from structured value", () => {
  const result = resolveBankTextEvidence({
    structuredBank: "ธนาคารกรุงไทย",
    structuredConfidence: 0,
    boxes: [{ text: "กรุงไทย", confidence: 0.85, bounds: { x: 10, y: 20, width: 80, height: 20 } }],
  });
  assert.equal(result.confidence, 0.85);
  assert.equal(result.status, "pass");
  assert.deepEqual(result.bounds, { x: 10, y: 20, width: 80, height: 20 });
});

test("keeps bank review-required when structured value has no OCR evidence", () => {
  const result = resolveBankTextEvidence({ structuredBank: "ธนาคารกรุงไทย", structuredConfidence: 0, boxes: [] });
  assert.equal(result.confidence, 0);
  assert.equal(result.status, "review_required");
  assert.equal(result.hasTextEvidence, false);
});
