import test from "node:test";
import assert from "node:assert/strict";
import { attachOcrTraceToQrCandidates } from "./local-ocr-fallback.mjs";

test("keeps the QR candidate and attaches the local OCR diagnostic trace when field parsing finds no region", () => {
  const candidate = { bounds: { x: 1, y: 2, width: 3, height: 4 }, data: { transaction: { refId: "qr-ref" } } };
  const trace = {
    schemaVersion: "digital-evidence.slip-ocr-trace.v2",
    attempts: [{ id: "full-page-original", scope: "full_page" }],
    regions: [],
  };

  const [result] = attachOcrTraceToQrCandidates([candidate], trace);

  assert.equal(result.data.transaction.refId, "qr-ref");
  assert.deepEqual(result.ocrDiagnosticTrace, trace);
  assert.deepEqual(result.ocrTextBoxes, []);
});
