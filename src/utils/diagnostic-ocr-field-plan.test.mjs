import assert from "node:assert/strict";
import test from "node:test";
import { buildDiagnosticOcrFieldPlan } from "./diagnostic-ocr-field-plan.mjs";

test("keeps diagnostic OCR lines as review-only crop plans when a template is unavailable", () => {
  const plan = buildDiagnosticOcrFieldPlan({ attempts: [{ lines: [
    { text: "กรุงไทย", confidence: 95, bounds: { x: 10, y: 20, width: 80, height: 18 } },
    { text: "18,000.00 บาท", confidence: 93, bounds: { x: 20, y: 80, width: 140, height: 22 } },
  ] }] }, { width: 300, height: 400 });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].field, "diagnostic_ocr_01");
  assert.equal(plan[0].source, "diagnostic_ocr_line");
  assert.equal(plan[0].ocrBox.confidence, 0.95);
  assert.deepEqual(plan[0].ocrBox.supportsFields, []);
});

test("drops invalid diagnostic geometry instead of creating a misleading crop", () => {
  const plan = buildDiagnosticOcrFieldPlan({ attempts: [{ lines: [
    { text: "outside", confidence: 99, bounds: { x: 90, y: 90, width: 20, height: 20 } },
    { text: "valid", confidence: 80, bounds: { x: 1, y: 2, width: 30, height: 10 } },
  ] }] }, { width: 100, height: 100 });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].ocrBox.rawOcr, "valid");
});
