import assert from "node:assert/strict";
import test from "node:test";
import { buildConsistentReviewPacketPayload } from "../consistent-review-packet.mjs";

const candidate = {
  slipId: "slip-b",
  chatSourceItemId: "chat-b",
  chatPageNumber: 2,
  groupId: "message-8",
  matchBasis: "amount_with_legal_intent",
  evidenceText: "ขอยืมเงิน 5,000.00 บาท คืนสิ้นเดือน",
  needsReview: true,
};

const record = {
  id: "slip-b",
  source: "slip.png",
  sha256: "b".repeat(64),
  dossierPage: 9,
  crop: "data:image/png;base64,c2xpcA==",
  data: {
    sender: { name: "ผู้โอน", bank: "ธนาคาร A" },
    receiver: { name: "ผู้รับ", bank: "ธนาคาร B" },
    transaction: { date: "2025-06-10", time: "14:10", amount: 5000, note: "คืนสิ้นเดือน", reference_no: "REF12345" },
  },
};

const chatPage = {
  sourceItemId: "chat-b",
  fileName: "chat.png",
  sha256: "a".repeat(64),
  pageNumber: 2,
  imageData: "data:image/png;base64,Y2hhdA==",
};

test("builds a source-linked, review-only pair and a 10-column index row", () => {
  const payload = buildConsistentReviewPacketPayload({
    caseNumber: "คดี 012/2569",
    candidates: [candidate],
    records: [record],
    chatPages: [chatPage],
  });

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.pairs.length, 1);
  assert.equal(payload.pairs[0].chat.sourceItemId, "chat-b");
  assert.equal(payload.pairs[0].chat.pageNumber, 2);
  assert.equal(payload.pairs[0].chat.sha256, "a".repeat(64));
  assert.equal(payload.pairs[0].slip.sha256, "b".repeat(64));
  assert.equal(payload.pairs[0].reviewStatus, "PENDING_HUMAN_REVIEW");
  assert.deepEqual(payload.summaryRows, [[
    9, "2025-06-10 14:10", "ธนาคาร A", "ผู้โอน", 5000,
    "ผู้รับ", "ธนาคาร B", "คืนสิ้นเดือน", "REF12345", "รอตรวจทาน",
  ]]);
  assert.equal(payload.summaryRows[0].length, 10);
});

test("matches the chat slice by source ID and page number, not page number alone", () => {
  assert.throws(() => buildConsistentReviewPacketPayload({
    caseNumber: "case",
    candidates: [{ ...candidate, chatSourceItemId: "other-chat" }],
    records: [record],
    chatPages: [chatPage],
  }), /ไม่พบภาพหน้าแชทต้นทาง/);
});

test("rejects an incomplete candidate instead of exporting a misleading pair", () => {
  assert.throws(() => buildConsistentReviewPacketPayload({
    caseNumber: "case",
    candidates: [{ ...candidate, needsReview: false }],
    records: [record],
    chatPages: [chatPage],
  }), /candidate ต้องเป็นรายการรอตรวจทาน/);
});
