import test from "node:test";
import assert from "node:assert/strict";
import {
  BarcodeFormat,
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  QRCodeWriter,
  RGBLuminanceSource,
} from "@zxing/library";
import { buildQrDecoderDiagnostics, cropQrPixelRegion, decodeQrWithEnhancedPixels, decodeQrWithFallback, formatQrDecoderRoute, scaleQrPixelsNearest, thresholdQrPixelsOtsu } from "./qr-decoder-fallback.mjs";
import jsQR from "jsqr";
import { enhanceOcrPixels } from "./enhance-for-ocr.mjs";

test("forensic enhancement hook recovers a low-contrast QR only after a normal decoder miss", async () => {
  const payload = "SKILL-QR-ENHANCEMENT-TEST";
  const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 180, 180, new Map());
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = matrix.get(x, y) ? 145 : 195;
      source[offset] = source[offset + 1] = source[offset + 2] = value;
      source[offset + 3] = 255;
    }
  }
  const original = new Uint8ClampedArray(source);
  assert.equal(jsQR(source, width, height, { inversionAttempts: "attemptBoth" }), null);

  const outcome = await decodeQrWithEnhancedPixels(
    source,
    width,
    height,
    enhanceOcrPixels,
    (pixels, w, h) => jsQR(pixels, w, h, { inversionAttempts: "attemptBoth" }),
  );

  assert.equal(outcome.result.data, payload);
  assert.equal(outcome.result.enhanced, true);
  assert.equal(formatQrDecoderRoute({ ...outcome.result, decoder: "primary", resolution: "original" }), "jsQR/enhanced");
  assert.deepEqual(outcome.stages, ["gamma_normalization", "median_denoise", "bilateral_denoise", "clahe_contrast", "unsharp_mask"]);
  assert.deepEqual(source, original);
});

test("nearest-neighbor upscaling preserves a low-resolution QR for local decode", () => {
  const payload = "E2E-PIXEL-RESAMPLE-TEST";
  const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 72, 72, new Map());
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = matrix.get(x, y) ? 0 : 255;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  const scaled = scaleQrPixelsNearest(pixels, width, height, 2.25);
  assert.equal(jsQR(scaled.data, scaled.width, scaled.height, { inversionAttempts: "attemptBoth" })?.data, payload);
});

test("rejects invalid nearest-neighbor QR scaling input", () => {
  assert.throws(() => scaleQrPixelsNearest(new Uint8ClampedArray(4), 1, 1, 1), RangeError);
});

test("isolates a QR ROI from its chat-like canvas and preserves payload after nearest upscale", () => {
  const payload = "ROI-PIXELS-TEST";
  const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 126, 126, new Map());
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const sourceWidth = width + 80;
  const sourceHeight = height + 100;
  const source = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
  for (let i = 0; i < source.length; i += 4) {
    source[i] = source[i + 1] = source[i + 2] = 226;
    source[i + 3] = 255;
  }
  const origin = { x: 37, y: 43 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((origin.y + y) * sourceWidth + origin.x + x) * 4;
      const value = matrix.get(x, y) ? 0 : 255;
      source[offset] = source[offset + 1] = source[offset + 2] = value;
    }
  }

  const roi = cropQrPixelRegion(source, sourceWidth, sourceHeight, {
    x: origin.x - 4, y: origin.y - 4, width: width + 8, height: height + 8,
  });
  const scaled = scaleQrPixelsNearest(roi.data, roi.width, roi.height, 2.25);
  assert.equal(jsQR(scaled.data, scaled.width, scaled.height, { inversionAttempts: "attemptBoth" })?.data, payload);
});

test("rejects QR ROI bounds that exceed the source pixel frame", () => {
  assert.throws(() => cropQrPixelRegion(new Uint8ClampedArray(16), 2, 2, {
    x: 1, y: 1, width: 2, height: 2,
  }), RangeError);
});

test("Otsu thresholding separates QR modules from a colored chat-like background", () => {
  const payload = "E2E-OTSU-THRESHOLD-TEST";
  const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 168, 168, new Map());
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const moduleValue = matrix.get(x, y);
      const value = moduleValue ? 42 : 226 + ((x + y) % 18);
      pixels[offset] = value;
      pixels[offset + 1] = moduleValue ? value : Math.min(255, value + 8);
      pixels[offset + 2] = moduleValue ? value : Math.min(255, value + 17);
      pixels[offset + 3] = 255;
    }
  }

  const thresholded = thresholdQrPixelsOtsu(pixels, width, height);
  assert.equal(jsQR(thresholded.data, width, height, { inversionAttempts: "attemptBoth" })?.data, payload);
});

test("rejects malformed input for Otsu QR thresholding", () => {
  assert.throws(() => thresholdQrPixelsOtsu(new Uint8ClampedArray(4), 2, 2), RangeError);
});

test("uses the primary QR decoder result without invoking fallback", async () => {
  let fallbackCalls = 0;
  const result = await decodeQrWithFallback(
    () => ({ data: "primary-payload", location: { topLeftCorner: { x: 2, y: 3 } } }),
    () => { fallbackCalls += 1; return null; },
  );

  assert.equal(result.data, "primary-payload");
  assert.equal(result.source, "primary");
  assert.equal(result.decoder, "primary");
  assert.equal(result.resolution, "original");
  assert.equal(formatQrDecoderRoute(result), "jsQR/original");
  assert.equal(fallbackCalls, 0);
});

test("uses fallback only when primary has no QR", async () => {
  const result = await decodeQrWithFallback(
    () => null,
    () => ({ data: "fallback-payload", location: { topLeftCorner: { x: 4, y: 5 } } }),
  );

  assert.equal(result.data, "fallback-payload");
  assert.equal(result.source, "fallback");
  assert.equal(result.decoder, "fallback");
  assert.equal(result.resolution, "original");
  assert.equal(formatQrDecoderRoute(result), "ZXing/original");
});

test("treats decoder exceptions as misses without losing the fallback result", async () => {
  const result = await decodeQrWithFallback(
    () => { throw new Error("primary decoder failed"); },
    () => ({ data: "fallback-payload", location: { topLeftCorner: { x: 1, y: 1 } } }),
  );

  assert.equal(result.data, "fallback-payload");
  assert.equal(result.source, "fallback");
});

test("returns null when neither decoder finds a QR", async () => {
  const result = await decodeQrWithFallback(() => null, () => null);
  assert.equal(result, null);
});

test("surfaces unique decoder routes as diagnostic-only messages", () => {
  assert.deepEqual(buildQrDecoderDiagnostics([
    "jsQR/original",
    undefined,
    "jsQR/original",
    "ZXing/upscaled",
  ]), [
    "QR decoder route: jsQR/original (diagnostic only)",
    "QR decoder route: ZXing/upscaled (diagnostic only)",
  ]);
});

test("hands a primary miss to the real ZXing QR decoder", async () => {
  const payload = "https://kasikornbank.com/e-slip/verify?ref=ZXING-TEST";
  const matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 180, 180, new Map());
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const luminance = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      luminance[y * width + x] = matrix.get(x, y) ? 0 : 255;
    }
  }

  let fallbackCalls = 0;
  const result = await decodeQrWithFallback(
    () => null,
    () => {
      fallbackCalls += 1;
      const source = new RGBLuminanceSource(luminance, width, height, width, height, 0, 0);
      const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source)));
      const [topLeft, topRight, bottomLeft, bottomRight] = decoded.getResultPoints();
      return {
        data: decoded.getText(),
        location: {
          topLeftCorner: { x: topLeft.getX(), y: topLeft.getY() },
          topRightCorner: { x: topRight.getX(), y: topRight.getY() },
          bottomLeftCorner: { x: bottomLeft.getX(), y: bottomLeft.getY() },
          bottomRightCorner: { x: bottomRight.getX(), y: bottomRight.getY() },
        },
      };
    },
  );

  assert.equal(fallbackCalls, 1);
  assert.equal(result.source, "fallback");
  assert.equal(result.data, payload);
  assert.ok(result.location.bottomRightCorner.x > result.location.topLeftCorner.x);
});
