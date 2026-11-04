import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalOcrPassPlan } from "../local-slip-ocr-plan.mjs";

test("standalone slip with a QR anchor schedules a bounded QR crop OCR pass", () => {
  assert.deepEqual(buildLocalOcrPassPlan("SLIP", 1), {
    qrAnchored: true,
    fullPage: true,
  });
});

test("chat OCR keeps the same QR crop and full-page evidence passes", () => {
  assert.deepEqual(buildLocalOcrPassPlan("CHAT", 1), {
    qrAnchored: true,
    fullPage: true,
  });
});

test("OCR without a QR anchor still retains the full-page pass", () => {
  assert.deepEqual(buildLocalOcrPassPlan("SLIP", 0), {
    qrAnchored: false,
    fullPage: true,
  });
});
