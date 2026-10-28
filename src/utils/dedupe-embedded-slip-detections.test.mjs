import assert from "node:assert/strict";
import test from "node:test";
import { dedupeEmbeddedSlipDetections } from "./dedupe-embedded-slip-detections.mjs";

function record(id, { sourceItemId = "source-a", x = 10, amount = 3000, name = "Receiver" } = {}) {
  return {
    id,
    sourceItemId,
    sourceBounds: { x, y: 20, width: 100, height: 200 },
    data: {
      transaction: { reference_no: "REF-1234567890", amount },
      sender: { name: null, account_no: null },
      receiver: { name, account_no: null },
      bank: { name: "TTB" },
      warnings: [],
    },
  };
}

function qrOnlyRecord(id, { sourceItemId = "source-a", chatPageNumber = 3, x = 500 } = {}) {
  const result = record(id, { sourceItemId, x, amount: null, name: null });
  result.chatPageNumber = chatPageNumber;
  result.data.transaction.reference_no = "A82bde77a7ade414c";
  result.data.raw_text = ["0038000600000101030060217A82bde77a7ade414c5102TH910469C5"];
  return result;
}

test("consolidates same-reference detections overlapping the same source image region", () => {
  const results = dedupeEmbeddedSlipDetections([
    record("sparse", { name: null }),
    record("rich", { x: 11 }),
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "rich");
  assert.ok(results[0].data.warnings.some((warning) => /รวมการตรวจจับซ้ำ/u.test(warning)));
});

test("preserves same-reference detections from different files, locations, or conflicting amounts", () => {
  const results = dedupeEmbeddedSlipDetections([
    record("a"),
    record("different-file", { sourceItemId: "source-b" }),
    record("different-location", { x: 500 }),
    record("conflict", { amount: 5000 }),
  ]);

  assert.equal(results.length, 4);
});

test("merges a QR-only reference into the richer slip record on the same source page", () => {
  const qr = qrOnlyRecord("qr", { x: 500 });
  qr.data.receiver.name = "OCR noise from nearby text";
  const slip = record("slip", { x: 10, amount: 3000, name: "Receiver" });
  slip.data.transaction.reference_no = "A82bde77a7ade414c";
  slip.chatPageNumber = 3;

  const results = dedupeEmbeddedSlipDetections([qr, slip]);

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "slip");
  assert.equal(results[0].data.transaction.amount, 3000);
  assert.equal(results[0].data.receiver.name, "Receiver");
  assert.ok(results[0].data.raw_text.includes(qr.data.raw_text[0]));
});

test("does not merge QR-only references across pages", () => {
  const qr = qrOnlyRecord("qr", { chatPageNumber: 2 });
  const slip = record("slip", { amount: 3000 });
  slip.data.transaction.reference_no = "A82bde77a7ade414c";
  slip.chatPageNumber = 3;

  assert.equal(dedupeEmbeddedSlipDetections([qr, slip]).length, 2);
});

test("attaches a same-page QR-only slip when its reference differs from structured OCR by one character", () => {
  const qr = qrOnlyRecord("qr", { chatPageNumber: 1 });
  qr.data.transaction.reference_no = "A8bf6e4dda8fb4300";
  qr.data.bank.name = null;
  qr.data.raw_text = ["0038000600000101030060217A8bf6e4dda8fb43005102TH9104A4F8"];
  const slip = record("slip", { amount: 2000, name: "จิณห์นิภา ประสาทเขตรการ" });
  slip.chatPageNumber = 1;
  slip.data.transaction.reference_no = "A8bf6eddda8fb4300";
  slip.data.bank.name = "ธนาคารกรุงศรีอยุธยา";
  slip.data.raw_text = ["รหัสอ้างอิง A8bf6eddda8fb4300", "ไปยัง จิณห์นิภา ประสาทเขตรการ", "จำนวนเงิน 2,000.00 บาท"];

  const results = dedupeEmbeddedSlipDetections([qr, slip]);

  assert.equal(results.length, 1);
  assert.equal(results[0].id, "slip");
  assert.equal(results[0].data.transaction.reference_no, "A8bf6eddda8fb4300");
  assert.equal(results[0].data.transaction.amount, 2000);
  assert.ok(results[0].data.raw_text.includes(qr.data.raw_text[0]));
  assert.ok(results[0].data.warnings.some((warning) => /Ref ID.*QR.*OCR.*ตรวจ/u.test(warning)));
  assert.equal(results[0].isConfirmed, undefined);
});
