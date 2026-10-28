import assert from "node:assert/strict";
import test from "node:test";
import { fitImageToEvidenceBlock } from "../fit-image-to-evidence-block.mjs";

const block = { x: 174, y: 247, width: 645, height: 890 };

test("fits portrait image inside evidence block without distortion", () => {
  const fit = fitImageToEvidenceBlock(540, 960, block);
  assert.equal(fit.scale, 890 / 960);
  assert.equal(fit.width, 500.625);
  assert.equal(fit.height, 890);
  assert.equal(fit.x, 246);
  assert.equal(fit.y, 247);
  assert.equal(fit.width / fit.height, 540 / 960);
});

test("does not enlarge a small image and centers it in the block", () => {
  const fit = fitImageToEvidenceBlock(320, 480, block);
  assert.equal(fit.scale, 1);
  assert.deepEqual({ x: fit.x, y: fit.y, width: fit.width, height: fit.height }, {
    x: 336, y: 452, width: 320, height: 480,
  });
});

test("bounds a landscape image and preserves aspect ratio", () => {
  const fit = fitImageToEvidenceBlock(1600, 900, block);
  assert.equal(fit.scale, 645 / 1600);
  assert.ok(fit.x >= block.x && fit.y >= block.y);
  assert.ok(fit.x + fit.width <= block.x + block.width);
  assert.ok(fit.y + fit.height <= block.y + block.height);
  assert.ok(Math.abs(fit.width / fit.height - 1600 / 900) < 1e-12);
});

test("rejects invalid image or block dimensions", () => {
  assert.throws(() => fitImageToEvidenceBlock(0, 10, block), RangeError);
  assert.throws(() => fitImageToEvidenceBlock(10, 10, { ...block, width: 0 }), RangeError);
});

test("uses integer floor positions while keeping the fitted image centered within one pixel", () => {
  const fit = fitImageToEvidenceBlock(540, 960, block);
  assert.equal(Number.isInteger(fit.x), true);
  assert.equal(Number.isInteger(fit.y), true);
  assert.ok(Math.abs(fit.x + fit.width / 2 - (block.x + block.width / 2)) < 1);
  assert.ok(Math.abs(fit.y + fit.height / 2 - (block.y + block.height / 2)) < 1);
});

test("keeps varied image aspect ratios inside translated blocks without enlargement", () => {
  const cases = [
    [1, 10000],
    [10000, 1],
    [1080, 1920],
    [1920, 1080],
    [320, 480],
    [4096, 4096],
  ];
  const target = { x: 31.5, y: 72.25, width: 645, height: 890 };

  for (const [width, height] of cases) {
    const fit = fitImageToEvidenceBlock(width, height, target);
    assert.ok(fit.x >= target.x && fit.y >= target.y, `${width}x${height} starts inside the block`);
    assert.ok(fit.x + fit.width <= target.x + target.width + 1e-9, `${width}x${height} stays within block width`);
    assert.ok(fit.y + fit.height <= target.y + target.height + 1e-9, `${width}x${height} stays within block height`);
    assert.ok(fit.scale <= 1, `${width}x${height} is never enlarged`);
    assert.ok(Math.abs(fit.width / fit.height - width / height) < 1e-9, `${width}x${height} preserves aspect ratio`);
  }
});
