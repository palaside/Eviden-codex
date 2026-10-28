import assert from "node:assert/strict";
import test from "node:test";
import cvModule from "@techstark/opencv-js";
import { createMorphologicalSlipOcrCandidate } from "../morphological-slip-ocr.mjs";

async function getCv() {
  if (cvModule instanceof Promise) return cvModule;
  if (cvModule.Mat) return cvModule;
  await new Promise((resolve) => { cvModule.onRuntimeInitialized = resolve; });
  return cvModule;
}

test("creates a grayscale OCR candidate with morphology, contrast, and threshold without mutating source", async () => {
  const cv = await getCv();
  const source = new cv.Mat(96, 160, cv.CV_8UC4, new cv.Scalar(220, 235, 250, 255));
  cv.rectangle(source, new cv.Point(24, 24), new cv.Point(136, 72), new cv.Scalar(170, 200, 230, 255), cv.FILLED);
  cv.rectangle(source, new cv.Point(42, 40), new cv.Point(112, 46), new cv.Scalar(20, 20, 20, 255), cv.FILLED);
  const original = Uint8Array.from(source.data);

  const candidate = createMorphologicalSlipOcrCandidate(cv, source);
  try {
    assert.equal(candidate.rows, source.rows);
    assert.equal(candidate.cols, source.cols);
    assert.equal(candidate.type(), cv.CV_8UC1);
    assert.deepEqual(Uint8Array.from(source.data), original);
    const pixels = Uint8Array.from(candidate.data);
    assert.ok(pixels.includes(0), "Otsu output should include foreground pixels");
    assert.ok(pixels.includes(255), "Otsu output should retain background pixels");
  } finally {
    candidate.delete();
    source.delete();
  }
});

test("rejects empty and non-RGBA source mats", async () => {
  const cv = await getCv();
  const empty = new cv.Mat();
  const gray = new cv.Mat(32, 32, cv.CV_8UC1, new cv.Scalar(200));
  try {
    assert.throws(() => createMorphologicalSlipOcrCandidate(cv, empty), /non-empty RGBA/u);
    assert.throws(() => createMorphologicalSlipOcrCandidate(cv, gray), /non-empty RGBA/u);
  } finally {
    empty.delete();
    gray.delete();
  }
});
