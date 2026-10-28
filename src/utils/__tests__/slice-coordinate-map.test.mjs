import assert from "node:assert/strict";
import test from "node:test";
import { mapSliceBoundsToSource } from "../slice-coordinate-map.ts";

test("maps a shrunken A4 slice crop back to source-image coordinates", () => {
  const mapped = mapSliceBoundsToSource(
    { x: 40, y: 50, width: 100, height: 80 },
    { sourceWidth: 1600, sliceStartY: 1000, contentScaleY: 1.2 },
  );

  assert.ok(Math.abs(mapped.x - 79.305) < 0.01);
  assert.ok(Math.abs(mapped.y - 2101.61) < 0.02);
  assert.ok(Math.abs(mapped.width - 198.265) < 0.01);
  assert.ok(Math.abs(mapped.height - 190.334) < 0.02);
});

test("accounts for uniform shrink scale and horizontal letterbox when mapping OCR bounds", () => {
  const mapped = mapSliceBoundsToSource(
    { x: 83, y: 100, width: 100, height: 80 },
    {
      sourceWidth: 807,
      sliceStartY: 400,
      contentScaleX: 807 / 720,
      contentScaleY: 1250 / 1115,
      contentOffsetX: 43,
    },
  );

  assert.equal(mapped.x, 40 * 807 / 720);
  assert.equal(mapped.y, 400 + 100 * 1250 / 1115);
  assert.equal(mapped.width, 100 * 807 / 720);
  assert.equal(mapped.height, 80 * 1250 / 1115);
});
