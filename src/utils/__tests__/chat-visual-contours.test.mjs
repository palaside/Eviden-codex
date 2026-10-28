import assert from "node:assert/strict";
import test from "node:test";
import cvModule from "@techstark/opencv-js";
import { findChatVisualRegions, findQrSlipObjectBounds, getContourRejectionReason } from "../chat-visual-contours.mjs";

test("uses the smallest plausible visual object enclosing the QR as the slip OCR boundary", () => {
  const selected = findQrSlipObjectBounds([
    { bounds: { x: 0, y: 0, width: 1200, height: 1800 } },
    { bounds: { x: 260, y: 180, width: 680, height: 1120 } },
    { bounds: { x: 50, y: 80, width: 110, height: 90 } },
  ], { x: 790, y: 820, width: 70, height: 70 }, { width: 1200, height: 1800 });

  assert.deepEqual(selected, { x: 260, y: 180, width: 680, height: 1120 });
});

test("does not accept a background-sized contour as a slip object boundary", () => {
  assert.equal(findQrSlipObjectBounds([
    { bounds: { x: 0, y: 0, width: 1200, height: 1800 } },
  ], { x: 790, y: 820, width: 70, height: 70 }, { width: 1200, height: 1800 }), null);
});

async function getCv() {
  if (cvModule instanceof Promise) return cvModule;
  if (cvModule.Mat) return cvModule;
  await new Promise((resolve) => { cvModule.onRuntimeInitialized = resolve; });
  return cvModule;
}

test("creates a reviewable contour mask and links a detected message region to OCR", async () => {
  const cv = await getCv();
  const width = 240, height = 140;
  const image = new cv.Mat(height, width, cv.CV_8UC4, new cv.Scalar(238, 238, 238, 255));
  cv.rectangle(image, new cv.Point(35, 30), new cv.Point(205, 95), new cv.Scalar(55, 100, 150, 255), cv.FILLED);
  const result = findChatVisualRegions(cv, image, [
    { index: 0, text: "โอนแล้ว", confidence: 0.9, bounds: { x: 55, y: 48, width: 120, height: 28 } },
  ]);
  image.delete();

  assert.ok(result.maskCoverage > 0 && result.maskCoverage < 1);
  const linked = result.regions.find((region) => region.relatedLineIndex === 0);
  assert.ok(linked, JSON.stringify(result.regions));
  assert.equal(linked.kind, "visual_region_candidate");
  assert.equal(linked.needsReview, true);
  assert.equal(linked.objectTypeCandidate, "text_bubble_candidate");
  assert.equal(linked.semanticMethod, "heuristic");
  assert.match(linked.semanticRationale, /OCR/u);
  assert.ok(linked.supportingDetectionMethods?.includes("opencv_hsv_lab_color_mask_contour"));
  assert.equal(result.regions.length, 1);
  assert.ok(linked.bounds.x <= 55 && linked.bounds.x + linked.bounds.width >= 175);
  assert.equal(result.contourAudit.grayscale.totalContours + result.contourAudit.color.totalContours, 2);
  assert.equal(result.contourAudit.grayscale.keptCount, 1);
  assert.equal(result.contourAudit.mergedColorCount, 1);
  assert.equal(result.contourAudit.finalCandidateCount, 1);
});

test("explains contour rejection without changing the existing thresholds", () => {
  const pageArea = 240 * 140;
  assert.equal(getContourRejectionReason({ width: 15, height: 20 }, 400, pageArea, true), "below_minimum_bounds");
  assert.equal(getContourRejectionReason({ width: 60, height: 20 }, 20, pageArea, true), "below_minimum_area");
  assert.equal(getContourRejectionReason({ width: 220, height: 130 }, pageArea * 0.8, pageArea, true), "above_maximum_area");
  assert.equal(getContourRejectionReason({ width: 40, height: 20 }, 200, pageArea, false), "small_contour_without_ocr_overlap");
  assert.equal(getContourRejectionReason({ width: 40, height: 20 }, 200, pageArea, true), null);
});

test("rejects a nearly full-frame contour as background instead of an evidence object", async () => {
  const cv = await getCv();
  const image = new cv.Mat(100, 160, cv.CV_8UC4, new cv.Scalar(20, 20, 20, 255));
  const result = findChatVisualRegions(cv, image, []);
  image.delete();
  assert.equal(result.regions.length, 0);
});

test("adds a review candidate for a low-luminance-contrast colored region", async () => {
  const cv = await getCv();
  const image = new cv.Mat(140, 240, cv.CV_8UC4, new cv.Scalar(120, 120, 120, 255));
  cv.rectangle(image, new cv.Point(35, 30), new cv.Point(205, 95), new cv.Scalar(70, 124, 170, 255), cv.FILLED);

  const result = findChatVisualRegions(cv, image, []);
  image.delete();

  const colorCandidate = result.regions.find((region) => region.detectionMethod === "opencv_hsv_lab_color_mask_contour");
  assert.ok(colorCandidate, JSON.stringify(result.regions));
  assert.equal(colorCandidate.kind, "visual_region_candidate");
  assert.equal(colorCandidate.needsReview, true);
});

test("segments a slip-shaped visual object around its QR for candidate OCR cropping", async () => {
  const cv = await getCv();
  const image = new cv.Mat(400, 320, cv.CV_8UC4, new cv.Scalar(238, 238, 238, 255));
  cv.rectangle(image, new cv.Point(82, 45), new cv.Point(238, 354), new cv.Scalar(55, 100, 150, 255), cv.FILLED);
  const { regions } = findChatVisualRegions(cv, image, []);
  image.delete();

  const selected = findQrSlipObjectBounds(regions, { x: 190, y: 190, width: 12, height: 12 }, { width: 320, height: 400 });
  assert.ok(selected, JSON.stringify(regions));
  assert.ok(selected.x <= 196 && selected.x + selected.width >= 196);
  assert.ok(selected.y <= 196 && selected.y + selected.height >= 196);
});
