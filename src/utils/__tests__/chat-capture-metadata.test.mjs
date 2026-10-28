import assert from "node:assert/strict";
import test from "node:test";
import { parseChatEventTimestamp, parseExifDateTime, sortChatInputsByCaptureTime } from "../chat-capture-metadata.mjs";

function exifJpeg(dateText) {
  const tiff = new Uint8Array(27 + dateText.length);
  const view = new DataView(tiff.buffer);
  tiff[0] = 0x49; tiff[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x0132, true);
  view.setUint16(12, 2, true);
  view.setUint32(14, dateText.length + 1, true);
  view.setUint32(18, 26, true);
  view.setUint32(22, 0, true);
  for (let index = 0; index < dateText.length; index += 1) tiff[26 + index] = dateText.charCodeAt(index);
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  payload.set(tiff, 6);
  const jpeg = new Uint8Array(8 + payload.length);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1]);
  new DataView(jpeg.buffer).setUint16(4, payload.length + 2, false);
  jpeg.set(payload, 6);
  jpeg[jpeg.length - 2] = 0xff; jpeg[jpeg.length - 1] = 0xd9;
  return jpeg;
}

test("returns EXIF wall-clock time without inventing a timezone", () => {
  assert.equal(parseExifDateTime(exifJpeg("2025:06:09 14:45:00")), "2025-06-09T14:45:00");
});

test("orders all timestamped captures chronologically and keeps stable filename order as fallback", () => {
  const timestamped = sortChatInputsByCaptureTime([
    { fileName: "chat (2).png", captureTime: "2025-06-09T15:00:00" },
    { fileName: "chat (1).png", captureTime: "2025-06-09T14:00:00" },
  ]);
  assert.deepEqual(timestamped.items.map((item) => item.fileName), ["chat (1).png", "chat (2).png"]);
  assert.equal(timestamped.usedCaptureTime, true);

  const incomplete = sortChatInputsByCaptureTime([
    { fileName: "chat (10).png", captureTime: "2025-06-09T15:00:00" },
    { fileName: "chat (2).png", captureTime: null },
  ]);
  assert.deepEqual(incomplete.items.map((item) => item.fileName), ["chat (2).png", "chat (10).png"]);
  assert.equal(incomplete.usedCaptureTime, false);
  assert.equal(incomplete.warnings.length, 1);
});

test("prefers a complete OCR event timeline, including Thai Buddhist years, over filename order", () => {
  const result = sortChatInputsByCaptureTime([
    { fileName: "chat (1).png", captureTime: null, eventTime: parseChatEventTimestamp("9 มิ.ย. 2568 15:15") },
    { fileName: "chat (2).png", captureTime: null, eventTime: parseChatEventTimestamp("8 มิ.ย. 2568 14:45") },
  ]);
  assert.deepEqual(result.items.map((item) => item.fileName), ["chat (2).png", "chat (1).png"]);
  assert.equal(result.usedEventTime, true);
});

test("joins adjacent OCR date and time separator lines into one event timestamp", async () => {
  const { findChatEventTimestamp } = await import("../chat-capture-metadata.mjs");
  assert.equal(findChatEventTimestamp([
    { text: "9 มิ.ย. 2568", bounds: { x: 120, y: 100, width: 100, height: 20 } },
    { text: "15:15", bounds: { x: 145, y: 124, width: 45, height: 18 } },
  ]), "2025-06-09T15:15:00");
});

test("falls back to complete EXIF timeline when OCR event timestamps are incomplete", () => {
  const result = sortChatInputsByCaptureTime([
    { fileName: "chat (2).jpg", captureTime: "2025-06-09T15:00:00", eventTime: null },
    { fileName: "chat (1).jpg", captureTime: "2025-06-09T14:00:00", eventTime: null },
  ]);
  assert.deepEqual(result.items.map((item) => item.fileName), ["chat (1).jpg", "chat (2).jpg"]);
  assert.equal(result.usedCaptureTime, true);
});
