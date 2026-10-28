import assert from "node:assert/strict";
import test from "node:test";
import cvModule from "@techstark/opencv-js";
import { createColorSeparatedOcrCandidate } from "../ocr-color-segmentation.mjs";

async function getCv() {
  if (cvModule instanceof Promise) return cvModule;
  if (cvModule.Mat) return cvModule;
  await new Promise((resolve) => { cvModule.onRuntimeInitialized = resolve; });
  return cvModule;
}

test("creates an HSV/LAB-assisted OCR candidate without mutating the source", async () => {
  const cv = await getCv();
  const source = new cv.Mat(80, 160, cv.CV_8UC4, new cv.Scalar(245, 245, 245, 255));
  cv.rectangle(source, new cv.Point(20, 15), new cv.Point(140, 65), new cv.Scalar(60, 130, 190, 255), cv.FILLED);
  cv.rectangle(source, new cv.Point(40, 35), new cv.Point(95, 42), new cv.Scalar(20, 20, 20, 255), cv.FILLED);
  const original = Uint8Array.from(source.data);

  const candidate = createColorSeparatedOcrCandidate(cv, source);

  try {
    assert.equal(candidate.rows, source.rows);
    assert.equal(candidate.cols, source.cols);
    assert.equal(candidate.type(), cv.CV_8UC1);
    assert.deepEqual(Uint8Array.from(source.data), original);
    assert.ok(cv.countNonZero(candidate) > 0);
    assert.equal(candidate.ucharPtr(5, 5)[0], 245);
    assert.equal(candidate.ucharPtr(25, 30)[0], 255);
    assert.equal(candidate.ucharPtr(40, 60)[0], 20);
  } finally {
    candidate.delete();
    source.delete();
  }
});

test("returns a deterministic candidate from unchanged source pixels", async () => {
  const cv = await getCv();
  const source = new cv.Mat(80, 160, cv.CV_8UC4, new cv.Scalar(245, 245, 245, 255));
  cv.rectangle(source, new cv.Point(20, 15), new cv.Point(140, 65), new cv.Scalar(60, 130, 190, 255), cv.FILLED);
  cv.rectangle(source, new cv.Point(40, 35), new cv.Point(95, 42), new cv.Scalar(20, 20, 20, 255), cv.FILLED);

  const first = createColorSeparatedOcrCandidate(cv, source);
  const second = createColorSeparatedOcrCandidate(cv, source);
  try {
    assert.deepEqual(Uint8Array.from(first.data), Uint8Array.from(second.data));
    assert.equal(first.ucharPtr(5, 5)[0], 245);
  } finally {
    first.delete();
    second.delete();
    source.delete();
  }
});

test("keeps tiny OCR crops readable when adaptive threshold windows do not fit", async () => {
  const cv = await getCv();
  const source = new cv.Mat(2, 4, cv.CV_8UC4, new cv.Scalar(90, 120, 160, 255));

  const candidate = createColorSeparatedOcrCandidate(cv, source);

  try {
    assert.equal(candidate.rows, 2);
    assert.equal(candidate.cols, 4);
    assert.equal(candidate.ucharPtr(0, 0)[0], 116);
  } finally {
    candidate.delete();
    source.delete();
  }
});
