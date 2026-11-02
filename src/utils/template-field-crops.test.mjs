import assert from "node:assert/strict";
import test from "node:test";
import { buildTemplateFieldPlan, cropTemplateFields, mergeTemplateAndOcrFields, toCanonicalFieldName } from "./template-field-crops.mjs";
import { getSlipTemplate } from "./slip-template-registry.mjs";

test("projects normalized template regions into source pixel bounds", () => {
  const plan = buildTemplateFieldPlan(getSlipTemplate("ttb-slip-v1"), { width: 2480, height: 3507 });
  assert.deepEqual(plan.amount.bounds, { x: 446, y: 1578, width: 1588, height: 386 });
  assert.equal(plan.receiverName.status, "review");
  assert.equal(plan.receiverName.source, "template_region_only");
});

test("crops every planned field without mutating the source canvas", () => {
  const source = { width: 1000, height: 1000 };
  const plan = buildTemplateFieldPlan(getSlipTemplate("krungthai-slip-v1"), source);
  const crops = cropTemplateFields(source, plan);
  assert.equal(crops.length, 9);
  assert.equal(crops.find((crop) => crop.field === "qr").bounds.x, 720);
  assert.deepEqual(source, { width: 1000, height: 1000 });
});

test("unknown template produces no field crops", () => {
  assert.deepEqual(buildTemplateFieldPlan(null, { width: 100, height: 100 }), {});
  assert.deepEqual(cropTemplateFields({ width: 100, height: 100 }, {}), []);
});

test("maps template field keys to the extraction contract", () => {
  assert.equal(toCanonicalFieldName("bank"), "bank_name");
  assert.equal(toCanonicalFieldName("senderName"), "sender_name");
  assert.equal(toCanonicalFieldName("receiverName"), "receiver_name");
  assert.equal(toCanonicalFieldName("transactionDate"), "date");
  assert.equal(toCanonicalFieldName("transactionTime"), "time");
  assert.equal(toCanonicalFieldName("referenceNo"), "reference_no");
  assert.equal(toCanonicalFieldName("amount"), "amount");
});

test("keeps planned fields reviewable when OCR has no box for them", () => {
  const plan = buildTemplateFieldPlan(getSlipTemplate("ttb-slip-v1"), { width: 1000, height: 1000 });
  const fields = mergeTemplateAndOcrFields(plan, [
    { text: "7,200.00", confidence: 0.94, bounds: plan.amount.bounds, supportsFields: ["amount"] },
  ]);
  assert.equal(fields.length, 9);
  assert.equal(fields.find((field) => field.field === "receiverName").ocrBox, null);
  assert.deepEqual(fields.find((field) => field.field === "receiverName").bounds, plan.receiverName.bounds);
});

test("retains an OCR-only bank field with its evidence bounds", () => {
  const fields = mergeTemplateAndOcrFields({}, [
    { text: "ttb", confidence: 0.91, bounds: { x: 10, y: 20, width: 80, height: 18 }, supportsFields: ["bank"] },
  ]);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].field, "bank");
  assert.deepEqual(fields[0].bounds, { x: 10, y: 20, width: 80, height: 18 });
});

test("merges snake_case OCR evidence into the matching template field", () => {
  const plan = buildTemplateFieldPlan(getSlipTemplate("ttb-slip-v1"), { width: 1000, height: 1000 });
  const fields = mergeTemplateAndOcrFields(plan, [
    { text: "ชื่อผู้รับ", confidence: 0.91, bounds: { x: 400, y: 700, width: 200, height: 24 }, supportsFields: ["receiver_name"] },
  ]);
  assert.equal(fields.length, 9);
  const receiver = fields.find((field) => field.field === "receiverName");
  assert.deepEqual(receiver.ocrBox.supportsFields, ["receiver_name"]);
  assert.deepEqual(receiver.bounds, { x: 400, y: 700, width: 200, height: 24 });
});
