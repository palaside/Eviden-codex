import assert from "node:assert/strict";
import test from "node:test";
import { detectSurroundingChatBubbles, getFilenameClassificationHint, getQrRetryWidth, getQrNativeRetryWidth, resolveImageClassification } from "../detect-image-type.ts";

test("classifies a QR-bearing portrait slip as a slip despite colored horizontal transitions", () => {
  assert.deepEqual(resolveImageClassification({ hasRealQr: true, ratio: 1.33, bubbles: 80 }), {
    type: "TYPE_SLIP_SOLO",
    category: "SLIP",
  });
});

test("retains chat-with-slip classification for a long chat capture containing a QR", () => {
  assert.deepEqual(resolveImageClassification({ hasRealQr: true, ratio: 3.1, bubbles: 20 }), {
    type: "TYPE_CHAT_WITH_SLIP",
    category: "CHAT",
  });
});

test("real QR classification outranks a conflicting chat filename hint", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: true,
    ratio: 3.1,
    bubbles: 20,
    filenameHint: "TYPE_SLIP_SOLO",
  }), { type: "TYPE_CHAT_WITH_SLIP", category: "CHAT" });
});

test("chat filename hint is only a fallback when no real QR was detected", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: false,
    ratio: 1.8,
    bubbles: 0,
    filenameHint: "TYPE_CHAT",
  }), { type: "TYPE_CHAT", category: "CHAT" });
});

test("slip filename hint is only a fallback when QR scanning finds no QR", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: false,
    ratio: 1.8,
    bubbles: 0,
    filenameHint: "TYPE_SLIP_SOLO",
  }), { type: "TYPE_SLIP_SOLO", category: "SLIP" });
  assert.deepEqual(resolveImageClassification({
    hasRealQr: true,
    ratio: 1.8,
    bubbles: 0,
    filenameHint: "TYPE_SLIP_SOLO",
  }), { type: "TYPE_SLIP_SOLO", category: "SLIP" });
});

test("strong long-chat pixel evidence outranks a conflicting slip filename hint", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: false,
    ratio: 3.2,
    bubbles: 12,
    filenameHint: "TYPE_SLIP_SOLO",
  }), { type: "TYPE_CHAT", category: "CHAT" });
});

test("a real QR in an extremely tall screenshot is a chat-with-slip even when bubble sampling misses", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: true,
    ratio: 9.88,
    bubbles: 0,
    filenameHint: "TYPE_SLIP_SOLO",
  }), { type: "TYPE_CHAT_WITH_SLIP", category: "CHAT" });
});

test("an extremely tall capture stays chat even when QR and bubble sampling both miss", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: false,
    ratio: 9.88,
    bubbles: 0,
    filenameHint: "TYPE_SLIP_SOLO",
  }), { type: "TYPE_CHAT", category: "CHAT" });
});

test("normalizes only known filename words into weak intake hints", () => {
  assert.equal(getFilenameClassificationHint("receipt-7.png"), "TYPE_SLIP_SOLO");
  assert.equal(getFilenameClassificationHint("chatv3 (17).PNG"), "TYPE_CHAT");
  assert.equal(getFilenameClassificationHint("LINE_2025-06.jpg"), "TYPE_CHAT");
  assert.equal(getFilenameClassificationHint("A4_IMG_ (17).PNG"), null);
});

test("does not classify ordinary filenames from chat or slip substrings", () => {
  assert.equal(getFilenameClassificationHint("deadline.png"), null);
  assert.equal(getFilenameClassificationHint("airline-ticket.jpg"), null);
  assert.equal(getFilenameClassificationHint("slipstream.png"), null);
});

test("does not classify a tall QR slip as chat without bubble evidence", () => {
  assert.deepEqual(resolveImageClassification({ hasRealQr: true, ratio: 3.1, bubbles: 0 }), {
    type: "TYPE_SLIP_SOLO",
    category: "SLIP",
  });
  assert.deepEqual(resolveImageClassification({ hasRealQr: true, ratio: 3.1, bubbles: 4 }), {
    type: "TYPE_SLIP_SOLO",
    category: "SLIP",
  });
});

test("classifies a short QR screenshot as chat-with-slip when bubbles surround the central slip", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: true,
    ratio: 1.34,
    bubbles: 0,
    surroundingChatBubbles: true,
  }), { type: "TYPE_CHAT_WITH_SLIP", category: "CHAT" });
});

test("does not promote central QR artwork to chat without outer message bubbles", () => {
  assert.deepEqual(resolveImageClassification({
    hasRealQr: true,
    ratio: 1.34,
    bubbles: 80,
    surroundingChatBubbles: false,
  }), { type: "TYPE_SLIP_SOLO", category: "SLIP" });
});

test("detects multiple bubble groups in outer bands but ignores central slip transitions", () => {
  const width = 100;
  const height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = 210;
    pixels[index * 4 + 1] = 210;
    pixels[index * 4 + 2] = 210;
    pixels[index * 4 + 3] = 255;
  }
  for (const bubble of [{ x: 12, y: 5, width: 36, height: 8 }, { x: 56, y: 12, width: 34, height: 8 }, { x: 14, y: 84, width: 34, height: 8 }]) {
    for (let y = bubble.y; y < bubble.y + bubble.height; y += 1) {
      for (let x = bubble.x; x < bubble.x + bubble.width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 250;
      }
    }
  }
  const centralOnly = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    centralOnly[index * 4] = centralOnly[index * 4 + 1] = centralOnly[index * 4 + 2] = 210;
    centralOnly[index * 4 + 3] = 255;
  }
  for (let y = 35; y < 65; y += 1) {
    for (let x = 10; x < 90; x += 1) centralOnly[(y * width + x) * 4] = centralOnly[(y * width + x) * 4 + 1] = centralOnly[(y * width + x) * 4 + 2] = (x % 2) ? 255 : 20;
  }
  assert.equal(detectSurroundingChatBubbles(pixels, width, height), true);
  assert.equal(detectSurroundingChatBubbles(centralOnly, width, height), false);
});

test("does not treat a gallery header and footer as surrounding chat bubbles", () => {
  const width = 100;
  const height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = pixels[index * 4 + 1] = pixels[index * 4 + 2] = 210;
    pixels[index * 4 + 3] = 255;
  }

  for (const bar of [{ x: 12, y: 5, width: 36, height: 12 }, { x: 12, y: 84, width: 36, height: 12 }]) {
    for (let y = bar.y; y < bar.y + bar.height; y += 1) {
      for (let x = bar.x; x < bar.x + bar.width; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 250;
      }
    }
  }

  assert.equal(detectSurroundingChatBubbles(pixels, width, height), false);
});

test("upscales missed QR scans within a bounded pixel budget", () => {
  assert.equal(getQrRetryWidth(2480, 1.414, false), 1500);
  assert.equal(getQrRetryWidth(2480, 1.414, true), null);
  assert.equal(getQrRetryWidth(2480, 3.1, false), 1500);
  assert.equal(getQrRetryWidth(828, 4320 / 828, false), 1242);
  assert.equal(getQrRetryWidth(900, 20, false), 707);
});

test("allows one native-resolution QR retry for bounded high-resolution portrait slips", () => {
  assert.equal(getQrNativeRetryWidth(2480, 3507, 1.414, false), 2480);
  assert.equal(getQrNativeRetryWidth(4000, 5000, 1.25, false), null);
  assert.equal(getQrNativeRetryWidth(2480, 3507, 3.1, false), null);
  assert.equal(getQrNativeRetryWidth(2480, 3507, 1.414, true), null);
});
