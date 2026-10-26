import test from "node:test";
import assert from "node:assert/strict";
import { clearUnreproducedAiNames, projectAiSlipBounds, findMatchingSlipRecord, mergeAiSlipProposal, getAiFilledFields, retainSenderNameAfterReprocess, retainAiOnlyRecordsAfterReprocess } from "../ai-slip-candidate.mjs";

const slip = (amount, name) => ({
  bank: { name: "กรุงไทย", confidence: 0.8 },
  transaction: { date: null, time: null, amount, currency: "THB", fee: null, reference_no: "A82bde77a7ade414c", transaction_id: null, note: null },
  sender: { name, bank: null, account_no: null },
  receiver: { name: null, bank: null, account_no: null },
  confidence: { date: 0, time: 0, amount: 0.8, reference_no: 0.8, sender_name: 0, receiver_name: 0, sender_account: 0, receiver_account: 0 },
  raw_text: [], warnings: [],
});

test("projects model's 0-1000 box to original pixels, rejects invalid boxes", () => {
  assert.deepEqual(projectAiSlipBounds([100, 200, 900, 800], 500, 1000), { x: 100, y: 100, width: 300, height: 800 });
  assert.equal(projectAiSlipBounds([900, 200, 100, 800], 500, 1000), null);
  assert.equal(projectAiSlipBounds([-1, 0, 100, 100], 500, 1000), null);
});

test("matches a QR box inside the same slip but not a distant slip", () => {
  const records = [{ id: "old", sourceBounds: { x: 350, y: 220, width: 50, height: 50 } }];
  assert.equal(findMatchingSlipRecord(records, { x: 100, y: 100, width: 320, height: 650 })?.id, "old");
  assert.equal(findMatchingSlipRecord(records, { x: 0, y: 0, width: 100, height: 100 }), null);
});

test("same Ref and amount join partially overlapping QR/OCR and AI boxes, not separate copies", () => {
  const records = [{ id: "old", sourceBounds: { x: 250, y: 320, width: 180, height: 220 }, data: slip(3000, null) }];
  const proposed = slip(3000, null);
  assert.equal(findMatchingSlipRecord(records, { x: 320, y: 150, width: 400, height: 460 }, proposed)?.id, "old");
  assert.equal(findMatchingSlipRecord(records, { x: 500, y: 700, width: 180, height: 200 }, proposed), null);
});

test("AI fills only missing fields, preserving local/user values and review warning", () => {
  const local = slip(3000, "ผู้ใช้แก้ชื่อแล้ว");
  const ai = slip(7200, "AI อ่านชื่ออื่น");
  ai.receiver.name = "น.ส. ผู้รับบนสลิป";
  const merged = mergeAiSlipProposal(local, ai);
  assert.equal(merged.transaction.amount, 3000);
  assert.equal(merged.sender.name, "ผู้ใช้แก้ชื่อแล้ว");
  assert.equal(merged.receiver.name, "น.ส. ผู้รับบนสลิป");
  assert.match(merged.warnings.join(" "), /ขัดกัน|รอตรวจ/);
  assert.deepEqual(getAiFilledFields(local, ai), ["receiver.name"]);
});

test("AI fills a blank string field while preserving masked OCR values", () => {
  const local = slip(7200, "");
  local.receiver.name = "สิบตรีณัฐชัย ร***";
  const ai = slip(7200, "นาย ไณัฐชัย รักษาวงษ์");
  ai.receiver.name = "น.ส. ตัวอย่าง ผู้รับ";

  const merged = mergeAiSlipProposal(local, ai);

  assert.equal(merged.sender.name, "นาย ไณัฐชัย รักษาวงษ์");
  assert.equal(merged.receiver.name, "สิบตรีณัฐชัย ร***");
  assert.deepEqual(getAiFilledFields(local, ai), ["sender.name"]);
});

test("merging a SlipVision retry keeps provider warnings for later review", () => {
  const local = slip(8000, "น.ส. ผู้โอน");
  const ai = slip(8000, "น.ส. ผู้โอน");
  ai.transaction.date = "2025-06-10";
  ai.warnings = ["SlipVision เสนอข้อมูล; รอตรวจทาน", "ปี 2 หลักตีความเป็น พ.ศ. 25xx; รอตรวจจากภาพ"];
  const merged = mergeAiSlipProposal(local, ai);
  assert.equal(merged.transaction.date, "2025-06-10");
  assert.match(merged.warnings.join(" "), /ปี 2 หลัก/);
  assert.match(merged.warnings.join(" "), /SlipVision/);
});

test("reprocessing the same slip retains its masked AI sender as a review candidate", () => {
  const priorData = slip(3000, "สิบตรีณัฐชัย ร***");
  priorData.confidence.sender_name = 0.9;
  const prior = [{ sourceSha256: "same-image", aiProposedFields: ["sender.name"], data: priorData }];
  const fresh = { sourceSha256: "same-image", needsReview: true, data: slip(3000, null) };

  const result = retainSenderNameAfterReprocess(prior, fresh);

  assert.equal(result.data.sender.name, "สิบตรีณัฐชัย ร***");
  assert.equal(result.data.confidence.sender_name, 0.9);
  assert.deepEqual(result.aiProposedFields, ["sender.name"]);
  assert.equal(result.needsReview, true);
});

test("does not carry a sender into a different image or overwrite fresh OCR", () => {
  const prior = [{ sourceSha256: "old-image", aiProposedFields: ["sender.name"], data: slip(3000, "สิบตรีณัฐชัย ร***") }];
  assert.equal(retainSenderNameAfterReprocess(prior, { sourceSha256: "new-image", data: slip(3000, null) }).data.sender.name, null);
  assert.equal(retainSenderNameAfterReprocess(prior, { sourceSha256: "old-image", data: slip(3000, "ชื่อจาก OCR") }).data.sender.name, "ชื่อจาก OCR");
});

test("does not carry an unmasked AI name forward when the fresh crop cannot reproduce it", () => {
  const priorData = slip(3000, "นาย ณัฐชัย รักษาวงษ์");
  priorData.receiver.name = "น.ส. ชื่อเดาผิด";
  const prior = [{
    sourceSha256: "same-image",
    aiProposedFields: ["all"],
    data: priorData,
  }];
  const fresh = { sourceSha256: "same-image", data: slip(3000, null) };
  fresh.data.receiver.name = null;

  const result = retainSenderNameAfterReprocess(prior, fresh);

  assert.equal(result.data.sender.name, null);
  assert.equal(result.data.receiver.name, null);
  assert.match(result.data.warnings.join(" "), /ตัดชื่อผู้โอน/);
  assert.match(result.data.warnings.join(" "), /ตัดชื่อผู้รับ/);
  assert.equal(result.needsReview, true);
});

test("clears stale unreviewed AI names from a matched candidate", () => {
  const prior = {
    aiProposedFields: ["all"],
    data: { ...slip(3000, "นาย ชื่อเดาผิด"), receiver: { name: "น.ส. ผู้รับเดาผิด", bank: null, account_no: null } },
  };
  const fresh = { ...slip(3000, null), receiver: { name: null, bank: null, account_no: null } };
  const result = clearUnreproducedAiNames(prior, fresh);
  assert.equal(result.sender.name, null);
  assert.equal(result.receiver.name, null);
  assert.equal(result.confidence.sender_name, 0);
  assert.equal(result.confidence.receiver_name, 0);
});

test("a user-reviewed masked sender survives reprocessing without becoming confirmed", () => {
  const reviewed = slip(3000, "สิบตรีณัฐชัย ร***");
  reviewed.reviewed_fields = ["sender_name"];
  const prior = [{ sourceSha256: "same-image", data: reviewed, isConfirmed: false }];
  const fresh = { sourceSha256: "same-image", data: slip(3000, null), isConfirmed: false };

  const result = retainSenderNameAfterReprocess(prior, fresh);

  assert.equal(result.data.sender.name, "สิบตรีณัฐชัย ร***");
  assert.deepEqual(result.data.reviewed_fields, ["sender_name"]);
  assert.equal(result.data.confidence.sender_name, 0);
  assert.equal(result.isConfirmed, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.aiProposedFields, undefined);
});

test("keeps an AI-only pending slip on the identical source file after local OCR finds none", () => {
  const prior = [{ id: "ai-8000", sourceSha256: "same-image", aiProposedFields: ["all"], data: slip(8000, "ผู้โอน"), isConfirmed: false, needsReview: true }];

  const result = retainAiOnlyRecordsAfterReprocess(prior, [], "same-image");

  assert.equal(result.length, 1);
  assert.equal(result[0].data.transaction.amount, 8000);
  assert.equal(result[0].isConfirmed, false);
  assert.equal(result[0].needsReview, true);
  assert.equal(retainAiOnlyRecordsAfterReprocess(prior, [], "changed-image").length, 0);
});

test("does not duplicate an AI-only slip when local OCR finds its reference", () => {
  const prior = [{ id: "ai-8000", sourceSha256: "same-image", aiProposedFields: ["all"], data: slip(8000, "ผู้โอน") }];
  const fresh = [{ id: "ocr-8000", sourceSha256: "same-image", data: slip(8000, null) }];

  assert.deepEqual(retainAiOnlyRecordsAfterReprocess(prior, fresh, "same-image"), fresh);
});
