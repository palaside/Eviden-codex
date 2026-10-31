import assert from "node:assert/strict";
import test from "node:test";
import { getQrAnchoredOcrCrop, getRecipientRetryCropBounds, getSoloSlipOcrCrop } from "./qr-anchored-ocr-crop.ts";
import { findRecipientName, findSlipOcrRegions } from "./slip-ocr-analysis.ts";

test("QR crop stays within the page and contains the QR anchor", () => {
  const image = { width: 807, height: 1115 };
  const qr = { x: 680, y: 510, width: 48, height: 48 };
  const crop = getQrAnchoredOcrCrop(image, qr);

  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.ok(crop.x + crop.width <= image.width);
  assert.ok(crop.y + crop.height <= image.height);
  assert.ok(qr.x + qr.width / 2 >= crop.x && qr.x + qr.width / 2 <= crop.x + crop.width);
  assert.ok(qr.y + qr.height / 2 >= crop.y && qr.y + qr.height / 2 <= crop.y + crop.height);
  assert.ok(crop.width * crop.height < image.width * image.height);
});

test("solo-slip crop keeps a small centered slip readable instead of scaling the page margins", () => {
  const crop = getSoloSlipOcrCrop(
    { width: 4960, height: 7014 },
    { x: 2991, y: 4199, width: 185, height: 185 },
  );

  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.ok(crop.x + crop.width <= 4960);
  assert.ok(crop.y + crop.height <= 7014);
  assert.ok(crop.width < 3000);
  assert.ok(crop.height < 5000);
  assert.ok(crop.x + crop.width / 2 > 1500);
  assert.ok(crop.y + crop.height / 2 > 2500);
});

test("recipient name on the line after the recipient label is extracted", () => {
  const result = findRecipientName([
    { text: "ไปยัง", confidence: 96, bbox: { x0: 20, y0: 100, x1: 100, y1: 126 } },
    { text: "น.ส. จินหณิกา ประสาทเขตกราน", confidence: 88, bbox: { x0: 20, y0: 132, x1: 310, y1: 164 } },
  ]);

  assert.equal(result.name, "น.ส. จินหณิกา ประสาทเขตกราน");
  assert.equal(result.confidence, 0.88);
});

test("recipient name is not inferred when the recipient label is absent", () => {
  const result = findRecipientName([
    { text: "น.ส. จินหณิกา ประสาทเขตกราน", confidence: 88, bbox: { x0: 20, y0: 132, x1: 310, y1: 164 } },
  ]);

  assert.equal(result.name, null);
});

test("recipient re-scan crop is available even when first-pass OCR misses the name", () => {
  const regions = findSlipOcrRegions([
    { text: "โอนเงินสำเร็จ", confidence: 95, bbox: { x0: 100, y0: 220, x1: 270, y1: 245 } },
    { text: "กรุงไทย", confidence: 95, bbox: { x0: 100, y0: 280, x1: 190, y1: 304 } },
    { text: "จำนวนเงิน 2,000.00 บาท", confidence: 92, bbox: { x0: 100, y0: 500, x1: 360, y1: 530 } },
  ], { width: 807, height: 1115 }, { includeRecipientSearchBand: true });

  assert.equal(regions.length, 1);
  assert.ok(regions[0].recipientFocusBounds);
  assert.ok(regions[0].recipientFocusBounds.y1 < 500);
  assert.ok(regions[0].recipientFocusBounds.y0 <= 100);
});

test("recipient retry uses the label/name search band instead of the amount region", () => {
  const retry = getRecipientRetryCropBounds({
    bounds: { x0: 260, y0: 430, x1: 610, y1: 590 },
    recipientFocusBounds: { x0: 245, y0: 120, x1: 625, y1: 420 },
  });

  assert.deepEqual(retry, { x: 245, y: 120, width: 380, height: 300 });
});
