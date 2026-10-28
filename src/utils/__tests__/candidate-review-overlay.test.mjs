import test from "node:test";
import assert from "node:assert/strict";
import { mapEvidenceBoundsToCanvas } from "../candidate-review-overlay.ts";

test("maps candidate coordinates into the displayed A4 image block", () => {
  assert.deepEqual(mapEvidenceBoundsToCanvas(
    { x: 100, y: 50, width: 40, height: 30 },
    { width: 800, height: 400 },
    { x: 90, y: 120, width: 600, height: 300 },
  ), { x: 165, y: 157.5, width: 30, height: 22.5 });
});

test("rejects out-of-image bounds and invalid dimensions", () => {
  assert.equal(mapEvidenceBoundsToCanvas(
    { x: -1, y: 0, width: 20, height: 20 },
    { width: 100, height: 100 },
    { x: 0, y: 0, width: 200, height: 200 },
  ), null);
  assert.equal(mapEvidenceBoundsToCanvas(
    { x: 0, y: 0, width: 20, height: 20 },
    { width: 0, height: 100 },
    { x: 0, y: 0, width: 200, height: 200 },
  ), null);
});
