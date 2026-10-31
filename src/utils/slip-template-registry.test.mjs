import assert from "node:assert/strict";
import test from "node:test";
import { getSlipTemplate, listSlipTemplates, selectSlipTemplate } from "./slip-template-registry.mjs";

test("selects the ttb template from Thai bank text without changing OCR values", () => {
  const template = selectSlipTemplate({ bankName: "ทีเอ็มบีธนชาต", rawText: ["ttb", "โอนเงินสำเร็จ"] });
  assert.equal(template.id, "ttb-slip-v1");
  assert.equal(template.reviewOnly, true);
  assert.equal(template.fields.receiverName.source, "template_region_only");
});

test("selects the Krungthai template from English bank text", () => {
  assert.equal(selectSlipTemplate({ bankName: "Krungthai", rawText: [] }).id, "krungthai-slip-v1");
});

test("does not guess a template when bank evidence is missing", () => {
  assert.equal(selectSlipTemplate({ bankName: null, rawText: ["โอนเงินสำเร็จ"] }), null);
});

test("does not expose mutable registry objects to callers", () => {
  const before = listSlipTemplates().length;
  const template = getSlipTemplate("ttb-slip-v1");
  template.fields.amount.region.x = 0;
  assert.equal(getSlipTemplate("ttb-slip-v1").fields.amount.region.x, 0.18);
  assert.equal(listSlipTemplates().length, before);
});
