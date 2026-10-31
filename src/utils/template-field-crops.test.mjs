import assert from "node:assert/strict";
import test from "node:test";
import { buildTemplateFieldPlan, cropTemplateFields } from "./template-field-crops.mjs";
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
