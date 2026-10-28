import assert from "node:assert/strict";
import test from "node:test";
import { runQrThenOcrPasses } from "../map-with-concurrency.ts";

test("completes QR detection across every page before starting any OCR", async () => {
  const events = [];
  const pages = ["page-1", "page-2", "page-3"];

  const results = await runQrThenOcrPasses(
    pages,
    2,
    async (page) => {
      events.push(`qr:${page}`);
      return `anchor:${page}`;
    },
    async (page, anchor) => {
      events.push(`ocr:${page}`);
      return `${anchor}+slip`;
    },
  );

  assert.deepEqual(results, ["anchor:page-1+slip", "anchor:page-2+slip", "anchor:page-3+slip"]);
  const firstOcr = events.findIndex((event) => event.startsWith("ocr:"));
  const lastQr = events.reduce((last, event, index) => event.startsWith("qr:") ? index : last, -1);
  assert.ok(firstOcr > lastQr, `expected all QR detections before OCR; got ${events.join(", ")}`);
});

test("runs OCR for every page regardless of whether QR found candidates or complete fields", async () => {
  const ocrPages = [];
  const pages = [
    { id: "no-qr", qr: [] },
    { id: "complete-qr", qr: [{ amount: 2000, reference: "REF-1", receiver: "มีชื่อแล้ว" }] },
    { id: "partial-qr", qr: [{ amount: null, reference: null, receiver: null }] },
  ];

  await runQrThenOcrPasses(
    pages,
    2,
    async (page) => page.qr,
    async (page, qr) => {
      ocrPages.push(page.id);
      return qr;
    },
  );

  assert.deepEqual(ocrPages.sort(), ["complete-qr", "no-qr", "partial-qr"]);
});

test("announces the OCR phase after the QR pass resolves", async () => {
  const phases = [];

  await runQrThenOcrPasses(
    ["page-1"],
    1,
    async () => [],
    async () => "ocr-result",
    (phase) => phases.push(phase),
  );

  assert.deepEqual(phases, ["qr", "ocr"]);
});
