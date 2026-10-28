import assert from "node:assert/strict";
import test from "node:test";
import { findVerticalOverlap } from "../stitch-overlap.mjs";

const raster = (rows, width = 8) => ({
  width,
  height: rows.length,
  data: Uint8Array.from(rows.flatMap((value) => Array(width).fill(value))),
});

test("finds a unique exact overlap at the boundary of two captures", () => {
  const previous = raster([5, 17, 29, 43, 61, 78, 94, 113, 132, 154, 177, 202]);
  const next = raster([94, 113, 132, 154, 177, 202, 221, 238, 249, 255]);
  assert.deepEqual(findVerticalOverlap(previous, next, { minOverlapRows: 4, maxOverlapRatio: 0.75 }), {
    overlapRows: 6,
    meanAbsoluteError: 0,
    pixelSimilarity: 1,
    appliedBrightnessOffset: 0,
  });
});

test("finds a unique overlap when the next capture has a small uniform brightness shift", () => {
  const width = 64;
  const source = Array.from({ length: 180 }, (_, y) => Array.from({ length: width }, (_, x) =>
    32 + ((x * 7 + y * 13 + (x * y) % 31) % 150)));
  const toRaster = (rows, shift = 0) => ({
    width,
    height: rows.length,
    data: Uint8Array.from(rows.flatMap((row) => row.map((value) => value + shift))),
  });
  const previous = toRaster(source.slice(0, 120));
  const next = toRaster(source.slice(60, 180), 18);

  assert.deepEqual(findVerticalOverlap(previous, next), {
    overlapRows: 60,
    meanAbsoluteError: 0,
    pixelSimilarity: 1,
    appliedBrightnessOffset: -18,
  });
});

test("rejects a capture pair whose brightness difference exceeds the matching allowance", () => {
  const width = 64;
  const source = Array.from({ length: 180 }, (_, y) => Array.from({ length: width }, (_, x) =>
    32 + ((x * 7 + y * 13 + (x * y) % 31) % 150)));
  const toRaster = (rows, shift = 0) => ({
    width,
    height: rows.length,
    data: Uint8Array.from(rows.flatMap((row) => row.map((value) => value + shift))),
  });

  assert.equal(findVerticalOverlap(toRaster(source.slice(0, 120)), toRaster(source.slice(60, 180), 32)), null);
});

test("rejects unrelated captures", () => {
  const previous = raster([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const next = raster([255, 230, 205, 180, 155, 130, 105, 80, 55, 30]);
  assert.equal(findVerticalOverlap(previous, next, { minOverlapRows: 4 }), null);
});

test("rejects ambiguous repeated patterns instead of trimming uncertain evidence", () => {
  const previous = raster([10, 30, 10, 30, 10, 30, 10, 30, 10, 30, 10, 30]);
  const next = raster([10, 30, 10, 30, 10, 30, 10, 30, 90, 120]);
  assert.equal(findVerticalOverlap(previous, next, { minOverlapRows: 4, maxOverlapRatio: 0.75 }), null);
});
