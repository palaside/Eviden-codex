import assert from "node:assert/strict";
import test from "node:test";
import { bilateralDenoiseOcrPixels, enhanceOcrPixels, getOcrEnhancementScale } from "../enhance-for-ocr.mjs";

test("limits enhanced retry crop scaling by both the scale cap and max dimension", () => {
  assert.equal(getOcrEnhancementScale(300, 400), 2.5);
  assert.equal(getOcrEnhancementScale(1200, 900), 1.5);
  assert.equal(getOcrEnhancementScale(2400, 1800), 0.75);
  assert.throws(() => getOcrEnhancementScale(0, 100), RangeError);
});

test("brightens a dark OCR copy without mutating source pixels or alpha", () => {
  const source = new Uint8ClampedArray([30, 30, 30, 255, 90, 90, 90, 128]);
  const original = [...source];

  const result = enhanceOcrPixels(source);

  assert.ok(result.pixels[0] > source[0]);
  assert.ok(result.pixels[4] > source[4]);
  assert.deepEqual([...source], original);
  assert.equal(result.pixels[3], 255);
  assert.equal(result.pixels[7], 128);
  assert.ok(result.meanAfter > result.meanBefore);
});

test("does not brighten an already bright OCR crop", () => {
  const result = enhanceOcrPixels(new Uint8ClampedArray([235, 235, 235, 255, 250, 250, 250, 255]));

  assert.ok(result.pixels[0] <= 235);
  assert.ok(result.pixels[4] <= 250);
  assert.ok(result.meanAfter <= result.meanBefore);
});

test("applies bounded spatial denoising and local contrast on an OCR retry crop", () => {
  const width = 7;
  const height = 7;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < source.length; offset += 4) {
    source.set([90, 90, 90, 255], offset);
  }
  source.set([255, 255, 255, 255], (3 * width + 3) * 4);
  const original = [...source];

  const result = enhanceOcrPixels(source, width, height);

  assert.deepEqual(result.stages, ["gamma_normalization", "median_denoise", "bilateral_denoise", "clahe_contrast", "unsharp_mask"]);
  assert.deepEqual([...source], original);
  assert.equal(result.pixels[(3 * width + 3) * 4], result.pixels[(3 * width + 2) * 4]);
  for (let offset = 0; offset < result.pixels.length; offset += 4) {
    assert.equal(result.pixels[offset], result.pixels[offset + 1]);
    assert.equal(result.pixels[offset + 1], result.pixels[offset + 2]);
    assert.equal(result.pixels[offset + 3], source[offset + 3]);
    assert.ok(result.pixels[offset] >= 0 && result.pixels[offset] <= 255);
  }
});

test("bilateral denoising reduces a mild noisy patch while preserving a strong edge", () => {
  const width = 7;
  const height = 7;
  const source = new Uint8Array(width * height);
  source.fill(100);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) source[y * width + x] = 115;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 4; x < width; x += 1) source[y * width + x] = 190;
  }
  const original = [...source];

  const result = bilateralDenoiseOcrPixels(source, width, height);

  assert.ok(result[3 * width + 2] < source[3 * width + 2]);
  assert.ok(result[3 * width + 2] > source[3 * width + 1]);
  assert.equal(result[3 * width + 3], source[3 * width + 3]);
  assert.deepEqual([...source], original);
});

test("raises contrast in a low-contrast OCR patch without exceeding the pixel ceiling", () => {
  const width = 64;
  const height = 64;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x % 32 < 16 ? 100 : 110;
      source.set([value, value, value, 255], (y * width + x) * 4);
    }
  }

  const result = enhanceOcrPixels(source, width, height);
  const left = result.pixels[(20 * width + 8) * 4];
  const right = result.pixels[(20 * width + 24) * 4];
  const normalizedMean = 105;
  const gamma = Math.max(0.65, Math.min(1.35, Math.log(0.58) / Math.log(normalizedMean / 255)));
  const expectedNormalizedDifference = Math.round(255 * Math.pow(110 / 255, gamma))
    - Math.round(255 * Math.pow(100 / 255, gamma));

  assert.ok(right - left > expectedNormalizedDifference);
  assert.ok(Math.max(...Array.from({ length: width * height }, (_, index) => result.pixels[index * 4])) <= 255);
});

test("rejects spatial dimensions that do not match the RGBA buffer", () => {
  assert.throws(
    () => enhanceOcrPixels(new Uint8ClampedArray(16), 3, 3),
    /dimensions must match RGBA pixel buffer/,
  );
});
