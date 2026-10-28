import assert from "node:assert/strict";
import test from "node:test";
import { decodeQrWithUpscaleFallback, formatQrDecoderRoute } from "../qr-decoder-fallback.mjs";

const hit = (data, offset = 0) => ({
  data,
  location: {
    topLeftCorner: { x: 120 + offset, y: 180 + offset },
    topRightCorner: { x: 180 + offset, y: 180 + offset },
    bottomLeftCorner: { x: 120 + offset, y: 240 + offset },
    bottomRightCorner: { x: 180 + offset, y: 240 + offset },
  },
});

test("uses the enlarged QR scan only after both original-resolution decoders miss", async () => {
  const calls = [];
  const result = await decodeQrWithUpscaleFallback(
    async () => { calls.push("primary"); return null; },
    async () => { calls.push("fallback"); return null; },
    async () => { calls.push("upscaled-primary"); return hit("QR", 0); },
    async () => { calls.push("upscaled-fallback"); return null; },
    1.5,
  );

  assert.deepEqual(calls, ["primary", "fallback", "upscaled-primary"]);
  assert.equal(result?.source, "upscaled");
  assert.equal(result?.decoder, "primary");
  assert.equal(result?.resolution, "upscaled");
  assert.equal(formatQrDecoderRoute(result), "jsQR/upscaled");
  assert.deepEqual(result?.location.topLeftCorner, { x: 80, y: 120 });
  assert.deepEqual(result?.location.bottomRightCorner, { x: 120, y: 160 });
});

test("does not upscale when an original-resolution decoder already finds the QR", async () => {
  let upscaledCalls = 0;
  const result = await decodeQrWithUpscaleFallback(
    async () => hit("QR"),
    async () => null,
    async () => { upscaledCalls += 1; return null; },
    async () => { upscaledCalls += 1; return null; },
    1.5,
  );

  assert.equal(result?.source, "primary");
  assert.equal(result?.decoder, "primary");
  assert.equal(result?.resolution, "original");
  assert.equal(upscaledCalls, 0);
});

test("rejects invalid upscale factors instead of returning distorted coordinates", async () => {
  const result = await decodeQrWithUpscaleFallback(
    async () => null,
    async () => null,
    async () => hit("QR"),
    async () => null,
    1,
  );

  assert.equal(result, null);
});
