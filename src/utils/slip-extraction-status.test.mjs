import test from "node:test";
import assert from "node:assert/strict";
import { buildSlipExtractionStatus, buildSlipQrWarning } from "./slip-extraction-status.mjs";

test("distinguishes a QR extraction failure from a completed scan with no candidate", () => {
  assert.deepEqual(buildSlipExtractionStatus({ qrFailed: true, ocrFailed: false }), {
    error: "การสแกน QR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ",
    warnings: ["การสแกน QR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ"],
  });
  assert.deepEqual(buildSlipExtractionStatus({ qrFailed: false, ocrFailed: false }), {
    error: "สแกน QR/OCR ในเครื่องแล้วแต่ยังไม่มี candidate สลิป — โปรดตรวจภาพต้นฉบับ",
    warnings: ["สแกน QR/OCR ในเครื่องแล้วแต่ยังไม่มี candidate สลิป — โปรดตรวจภาพต้นฉบับ"],
  });
});

test("reports QR and OCR failures independently without implying a negative finding", () => {
  assert.deepEqual(buildSlipExtractionStatus({ qrFailed: true, ocrFailed: true }), {
    error: "การสแกน QR และ OCR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ",
    warnings: ["การสแกน QR ในเครื่องขัดข้อง", "OCR ในเครื่องขัดข้อง", "โปรดตรวจภาพต้นฉบับ"],
  });
  assert.deepEqual(buildSlipExtractionStatus({ qrFailed: false, ocrFailed: true }), {
    error: "OCR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ",
    warnings: ["OCR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ"],
  });
});

test("keeps a successful review candidate but warns when QR extraction failed", () => {
  assert.equal(buildSlipQrWarning(true), "QR scan ในเครื่องขัดข้อง; candidate ที่ได้จากแหล่งอื่นยังต้องตรวจทาน");
  assert.equal(buildSlipQrWarning(false), null);
});
