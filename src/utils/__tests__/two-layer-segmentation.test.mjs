import assert from "node:assert/strict";
import test from "node:test";
import { formatLayer2ReviewItem, segmentOcrTextLines } from "../two-layer-segmentation.mjs";

test("keeps nearby OCR lines as one reviewable message candidate with linked text boxes", () => {
  const result = segmentOcrTextLines([
    { text: "สวัสดีครับ", confidence: 0.92, bounds: { x: 50, y: 40, width: 110, height: 24 } },
    { text: "โอนให้แล้ว", confidence: 0.86, bounds: { x: 52, y: 68, width: 120, height: 24 } },
  ], { width: 500, height: 600 });

  assert.equal(result.layer1.length, 1);
  assert.equal(result.layer1[0].kind, "text_message_candidate");
  assert.equal(result.layer1[0].bounds.x, 40);
  assert.equal(result.layer2.length, 2);
  assert.equal(result.layer2[0].groupId, result.layer1[0].id);
  assert.equal(result.layer1[0].needsReview, true);
});

test("does not merge distant OCR lines and clips padded boxes to image bounds", () => {
  const result = segmentOcrTextLines([
    { text: "ข้อความด้านบน", confidence: 0.9, bounds: { x: 3, y: 5, width: 100, height: 20 } },
    { text: "ข้อความด้านล่าง", confidence: 0.8, bounds: { x: 250, y: 300, width: 110, height: 22 } },
  ], { width: 400, height: 400 });

  assert.equal(result.layer1.length, 2);
  assert.equal(result.layer1[0].bounds.x, 0);
  assert.equal(result.layer1[0].bounds.y, 0);
  assert.equal(result.layer2[1].text, "ข้อความด้านล่าง");
});

test("returns empty layers when OCR found no lines", () => {
  assert.deepEqual(segmentOcrTextLines([], { width: 10, height: 10 }), { layer1: [], layer2: [] });
});

test("uses Tesseract word boxes for Layer 2 while keeping them linked to the message candidate", () => {
  const result = segmentOcrTextLines([
    {
      text: "โอน เงิน แล้ว",
      confidence: 0.9,
      bounds: { x: 20, y: 40, width: 130, height: 24 },
      words: [
        { text: "โอน", confidence: 0.95, bounds: { x: 20, y: 40, width: 30, height: 24 } },
        { text: "เงิน", confidence: 0.88, bounds: { x: 55, y: 40, width: 35, height: 24 } },
        { text: "แล้ว", confidence: 0.86, bounds: { x: 95, y: 40, width: 55, height: 24 } },
      ],
    },
  ], { width: 200, height: 100 });

  assert.deepEqual(result.layer2.map((word) => word.text), ["โอน", "เงิน", "แล้ว"]);
  assert.ok(result.layer2.every((word) => word.unit === "word" && word.groupId === result.layer1[0].id));
});

test("prefers Tesseract symbol boxes for glyph-level Layer 2 when available", () => {
  const result = segmentOcrTextLines([{
    text: "OK",
    confidence: 0.9,
    bounds: { x: 10, y: 10, width: 30, height: 20 },
    words: [{
      text: "OK",
      confidence: 0.9,
      bounds: { x: 10, y: 10, width: 30, height: 20 },
      symbols: [
        { text: "O", confidence: 0.95, bounds: { x: 10, y: 10, width: 14, height: 20 } },
        { text: "K", confidence: 0.84, bounds: { x: 26, y: 10, width: 14, height: 20 } },
      ],
    }],
  }], { width: 100, height: 100 });

  assert.deepEqual(result.layer2.map((glyph) => [glyph.text, glyph.unit]), [["O", "glyph"], ["K", "glyph"]]);
  assert.ok(result.layer2.every((glyph) => glyph.groupId === result.layer1[0].id));
});

test("preserves Tesseract word boundaries on glyph-level Layer 2 tokens", () => {
  const result = segmentOcrTextLines([{
    text: "ชื่อ สมชาย ใจดี",
    confidence: 0.9,
    bounds: { x: 10, y: 10, width: 180, height: 24 },
    words: [
      { text: "ชื่อ", bounds: { x: 10, y: 10, width: 38, height: 24 }, symbols: [{ text: "ช", bounds: { x: 10, y: 10, width: 12, height: 24 } }] },
      { text: "สมชาย", bounds: { x: 54, y: 10, width: 60, height: 24 }, symbols: [{ text: "ส", bounds: { x: 54, y: 10, width: 12, height: 24 } }] },
      { text: "ใจดี", bounds: { x: 120, y: 10, width: 46, height: 24 }, symbols: [{ text: "ใ", bounds: { x: 120, y: 10, width: 12, height: 24 } }] },
    ],
  }], { width: 220, height: 80 });

  assert.deepEqual(result.layer2.map(({ wordIndex }) => wordIndex), [0, 1, 2]);
});

test("formats Layer 2 OCR units with type, confidence, group link, text, and source bounds", () => {
  assert.deepEqual(formatLayer2ReviewItem({
    groupId: "text-block-3",
    unit: "word",
    text: "ยืนยัน",
    sourceLineText: "ผู้รับ: ยืนยัน",
    confidence: 0.876,
    bounds: { x: 12, y: 34, width: 50, height: 18 },
    streamBounds: { x: 112, y: 234, width: 50, height: 18 },
  }), {
    label: "Layer 2 · word · 88% · group text-block-3",
    text: "ยืนยัน",
    sourceLineText: "ผู้รับ: ยืนยัน",
    boundsLabel: "กรอบหน้า: 12,34 50×18",
    streamBoundsLabel: "กรอบ stream: 112,234 50×18",
  });
});

test("separates a standalone date-time marker and links it to the nearest message group", () => {
  const result = segmentOcrTextLines([
    { text: "ข้อความก่อนเวลา", confidence: 0.9, index: 0, bounds: { x: 40, y: 30, width: 140, height: 22 } },
    { text: "9 มิ.ย. 2568 15:15", confidence: 0.86, index: 1, bounds: { x: 120, y: 70, width: 130, height: 18 } },
  ], { width: 300, height: 200 });

  const marker = result.layer1.find((item) => item.kind === "timestamp_marker_candidate");
  const message = result.layer1.find((item) => item.kind === "text_message_candidate");
  assert.ok(marker);
  assert.equal(marker.relatedTextGroupId, message.id);
  assert.equal(marker.label, "9 มิ.ย. 2568 15:15");
  assert.equal(marker.semanticMethod, "heuristic");
  assert.equal(result.layer2.find((line) => line.groupId === marker.id).text, marker.label);
});

test("links OpenCV visual-region candidates to the OCR text group they contain", () => {
  const result = segmentOcrTextLines([
    { text: "โอนแล้ว", confidence: 0.9, index: 3, bounds: { x: 50, y: 40, width: 100, height: 22 } },
  ], { width: 300, height: 200 }, [{
    kind: "visual_region_candidate",
    bounds: { x: 30, y: 20, width: 180, height: 70 },
    confidence: 0.58,
    relatedLineIndex: 3,
    needsReview: true,
    detectionMethod: "opencv_adaptive_mask_contour",
    supportingDetectionMethods: ["opencv_adaptive_mask_contour", "opencv_hsv_lab_color_mask_contour"],
  }]);

  const region = result.layer1.find((item) => item.kind === "visual_region_candidate");
  const message = result.layer1.find((item) => item.kind === "text_message_candidate");
  assert.equal(region.relatedTextGroupId, message.id);
  assert.deepEqual(region.supportingDetectionMethods, ["opencv_adaptive_mask_contour", "opencv_hsv_lab_color_mask_contour"]);
});

test("links an avatar-like visual candidate to the nearest OCR message group", () => {
  const result = segmentOcrTextLines([
    { text: "ข้อความ", confidence: 0.9, index: 7, bounds: { x: 75, y: 44, width: 100, height: 22 } },
  ], { width: 300, height: 200 }, [{
    kind: "visual_region_candidate",
    bounds: { x: 30, y: 40, width: 28, height: 28 },
    confidence: 0.54,
    relatedLineIndex: null,
    objectTypeCandidate: "avatar_or_icon_candidate",
    needsReview: true,
    detectionMethod: "opencv_adaptive_mask_contour",
  }]);

  const avatar = result.layer1.find((item) => item.objectTypeCandidate === "avatar_or_icon_candidate");
  const message = result.layer1.find((item) => item.kind === "text_message_candidate");
  assert.equal(avatar.relatedTextGroupId, message.id);
});
