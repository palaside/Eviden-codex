import assert from "node:assert/strict";
import test from "node:test";
import { buildChatOcrGroups, findChatSlipCorroborationCandidates, getCorroborationBasisLabel } from "../chat-slip-corroboration.mjs";

const slip = {
  id: "slip-1",
  referenceNo: "Afelcd222498c42a5",
  amount: 5000,
};

test("proposes a review-only match when a chat OCR group contains the exact slip reference", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [slip],
    chatPages: [{ sourceItemId: "chat-source-4", pageNumber: 4, groups: [{ groupId: "message-1", lines: ["โอนแล้ว Ref Afelcd222498c42a5"] }] }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].slipId, "slip-1");
  assert.equal(result[0].chatPageNumber, 4);
  assert.equal(result[0].chatSourceItemId, "chat-source-4");
  assert.equal(result[0].matchBasis, "exact_reference");
  assert.equal(result[0].needsReview, true);
});

test("keeps same-numbered pages from different chat files linked to their own source IDs", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ ...slip, amount: null }],
    chatPages: [
      { sourceItemId: "chat-a", pageNumber: 1, groups: [{ groupId: "message-a", lines: ["Ref Afelcd222498c42a5"] }] },
      { sourceItemId: "chat-b", pageNumber: 1, groups: [{ groupId: "message-b", lines: ["Ref Afelcd222498c42a5"] }] },
    ],
  });

  assert.deepEqual(result.map(({ chatSourceItemId, chatPageNumber }) => [chatSourceItemId, chatPageNumber]), [
    ["chat-a", 1],
    ["chat-b", 1],
  ]);
});

test("requires transfer intent alongside an exact amount", () => {
  const pages = [{ pageNumber: 2, groups: [
    { groupId: "unrelated", lines: ["ยอดคงเหลือ 5,000.00 บาท"] },
    { groupId: "transfer", lines: ["โอนเงินแล้ว จำนวน 5,000.00 บาท"] },
  ] }];

  const result = findChatSlipCorroborationCandidates({ slips: [{ ...slip, referenceNo: null }], chatPages: pages });

  assert.deepEqual(result.map((candidate) => candidate.groupId), ["transfer"]);
  assert.equal(result[0].matchBasis, "amount_with_transfer_intent");
});

test("recognizes skill-defined check-total phrases only with the exact currency amount", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ ...slip, referenceNo: null }],
    chatPages: [{ pageNumber: 2, groups: [
      { groupId: "thai-check", lines: ["เช็กยอดด้วย 5,000 บาท"] },
      { groupId: "ocr-spelling", lines: ["เช็คยอดด้วย 5,000.00 บาท"] },
      { groupId: "no-amount", lines: ["เช็กยอดด้วยครับ"] },
      { groupId: "wrong-amount", lines: ["เช็กยอดด้วย 500 บาท"] },
    ] }],
  });

  assert.deepEqual(result.map((candidate) => candidate.groupId), ["thai-check", "ocr-spelling"]);
  assert.ok(result.every((candidate) => candidate.needsReview));
  assert.ok(result.every((candidate) => candidate.matchBasis === "amount_with_transfer_intent"));
});

test("matches an OCR bare remaining amount only when the same message has loan-interest intent", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "slip-7200", amount: 7200, referenceNo: null }],
    chatPages: [{ pageNumber: 2, groups: [
      { groupId: "supported", lines: ["มันใช้7000 แต่ต้องเอา8000 หักดอก", "มันเหลอ 7200"] },
      { groupId: "plain-number", lines: ["มันเหลือ 7200"] },
      { groupId: "amount-without-intent", lines: ["ยอดคงเหลือ 7200"] },
      { groupId: "unlabeled-with-intent", lines: ["กู้เงิน 7200"] },
    ] }],
  });

  assert.deepEqual(result.map((candidate) => candidate.groupId), ["supported"]);
  assert.equal(result[0].matchBasis, "amount_with_legal_intent");
  assert.equal(result[0].needsReview, true);
});

test("matches whole-baht amounts only when a currency marker or unit is present", () => {
  const slips = [{ ...slip, referenceNo: null }];
  const chatPages = [{ pageNumber: 2, groups: [
    { groupId: "thai-unit", lines: ["โอนเงินแล้ว 5,000 บาท"] },
    { groupId: "baht-symbol", lines: ["จ่ายแล้ว ฿5000"] },
    { groupId: "bare-number", lines: ["โอนเงินแล้ว 5000"] },
    { groupId: "balance", lines: ["ยอดคงเหลือ 5,000 บาท"] },
  ] }];

  const result = findChatSlipCorroborationCandidates({ slips, chatPages });

  assert.deepEqual(result.map(({ groupId }) => groupId), ["thai-unit", "baht-symbol"]);
});

test("proposes a review-only amount candidate for a legal loan-intent message", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ ...slip, referenceNo: null }],
    chatPages: [{ pageNumber: 6, groups: [{
      groupId: "loan-agreement",
      lines: ["ขอยืมเงิน 5,000.00 บาท คืนสิ้นเดือน"],
    }] }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].matchBasis, "amount_with_legal_intent");
  assert.equal(result[0].needsReview, true);
});

test("uses a linked full chat timestamp to allow an amount-and-intent candidate within 15 minutes", () => {
  const layer1 = [{ kind: "timestamp_marker_candidate", label: "10 มิ.ย. 2568 14:00", relatedTextGroupId: "transfer" }];
  const groups = buildChatOcrGroups([
    { groupId: "transfer", unit: "line", text: "โอนเงินแล้ว 3,000.00 บาท" },
  ], [], layer1);
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "slip-2", amount: 3000, referenceNo: null, date: "2025-06-10", time: "14:15" }],
    chatPages: [{ pageNumber: 3, groups }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].matchBasis, "amount_with_transfer_intent_and_time_window");
  assert.equal(result[0].timeProximityMinutes, 15);
  assert.equal(result[0].timeWindowValidated, true);
});

test("recognizes a skill-defined completion phrase only with a matching amount and timestamp within 15 minutes", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "slip-3", amount: 3000, referenceNo: null, date: "2025-06-10", time: "14:05" }],
    chatPages: [{ pageNumber: 3, groups: [{
      groupId: "completion",
      lines: ["ยอด 3,000.00 บาท เรียบร้อยค่ะ"],
      eventTimestamp: "2025-06-10T14:00:00",
    }] }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].matchBasis, "amount_with_confirmation_and_time_window");
  assert.equal(result[0].timeProximityMinutes, 5);
  assert.equal(result[0].needsReview, true);
  assert.match(getCorroborationBasisLabel(result[0]), /ข้อความยืนยัน/);
});

test("does not match confirmation-only wording without a validated timestamp window", () => {
  assert.deepEqual(findChatSlipCorroborationCandidates({
    slips: [{ id: "slip-3", amount: 3000, referenceNo: null, date: "2025-06-10", time: "14:05" }],
    chatPages: [{ pageNumber: 3, groups: [{
      groupId: "completion",
      lines: ["ยอด 3,000.00 บาท เรียบร้อยค่ะ"],
    }] }],
  }), []);
});

test("does not propose an amount-and-intent match when complete timestamps differ by more than 15 minutes", () => {
  const layer1 = [{ kind: "timestamp_marker_candidate", label: "10 มิ.ย. 2568 14:00", relatedTextGroupId: "transfer" }];
  const groups = buildChatOcrGroups([
    { groupId: "transfer", unit: "line", text: "โอนเงินแล้ว 3,000.00 บาท" },
  ], [], layer1);

  assert.deepEqual(findChatSlipCorroborationCandidates({
    slips: [{ id: "slip-2", amount: 3000, referenceNo: null, date: "2025-06-10", time: "14:16" }],
    chatPages: [{ pageNumber: 3, groups }],
  }), []);
});

test("retains exact reference evidence but flags a timestamp outside the 15-minute window", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ ...slip, date: "2025-06-10", time: "14:30" }],
    chatPages: [{ pageNumber: 3, groups: [{
      groupId: "reference-message",
      lines: ["โอนแล้ว Ref Afelcd222498c42a5"],
      eventTimestamp: "2025-06-10T14:00:00",
    }] }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].matchBasis, "exact_reference");
  assert.equal(result[0].timeProximityMinutes, 30);
  assert.equal(result[0].timestampOutsideWindow, true);
});

test("keeps amount-and-intent candidates review-only when either timestamp is incomplete", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "slip-2", amount: 3000, referenceNo: null, date: null, time: null }],
    chatPages: [{ pageNumber: 3, groups: [{ groupId: "transfer", lines: ["โอนเงินแล้ว 3,000.00 บาท"] }] }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].timeWindowValidated, false);
  assert.equal(result[0].needsReview, true);
});

test("does not match by amount alone, partial reference, or synthetic reference", () => {
  const chatPages = [{ pageNumber: 1, groups: [
    { groupId: "amount-only", lines: ["5,000.00 บาท"] },
    { groupId: "partial-ref", lines: ["Afelcd222498"] },
  ] }];

  assert.deepEqual(findChatSlipCorroborationCandidates({
    slips: [slip, { ...slip, id: "synthetic", referenceNo: "SLIP-1" }],
    chatPages,
  }), []);
});

test("does not treat a slip reference that is only a substring of a longer transaction ID as exact", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "ref-slip", referenceNo: "Afelcd222498c42a5", amount: null }],
    chatPages: [{ pageNumber: 1, groups: [{
      groupId: "different-transaction",
      lines: ["อ้างอิง Ref: xAfelcd222498c42a5x"],
    }] }],
  });

  assert.deepEqual(result, []);
});

test("accepts a whole reference value after a Ref label even when attached to the label", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "ref-slip", referenceNo: "Afelcd222498c42a5", amount: null }],
    chatPages: [{ pageNumber: 1, groups: [{
      groupId: "exact-transaction",
      lines: ["โอนแล้ว RefAfelcd222498c42a5"],
    }] }],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].matchBasis, "exact_reference");
});

test("reassembles OCR glyphs in reading order without joining separate text groups", () => {
  const groups = buildChatOcrGroups([
    { groupId: "g1", unit: "glyph", text: "Afel", bounds: { x: 20, y: 10, width: 10, height: 8 } },
    { groupId: "g1", unit: "glyph", text: "cd22", bounds: { x: 31, y: 10, width: 16, height: 8 } },
    { groupId: "g1", unit: "glyph", text: "2498c42a5", bounds: { x: 48, y: 10, width: 30, height: 8 } },
    { groupId: "g2", unit: "line", text: "ยอดคงเหลือ 5,000.00" },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].lines, ["Afelcd222498c42a5"]);
  assert.deepEqual(groups[1].lines, ["ยอดคงเหลือ 5,000.00"]);
});

test("removes OCR tokens inside the embedded slip crop before matching chat corroboration", () => {
  const groups = buildChatOcrGroups([
    {
      groupId: "text-block-5", unit: "line", text: "Ref Afelcd222498c42a5",
      bounds: { x: 10, y: 10, width: 200, height: 20 },
      sourceReferences: [{ sourceItemId: "chat-1", bounds: { x: 100, y: 100, width: 200, height: 30 } }],
    },
    {
      groupId: "text-block-5", unit: "line", text: "ค่อยโอนทีเดียว ไม่เป็นไร",
      bounds: { x: 10, y: 50, width: 200, height: 20 },
      sourceReferences: [{ sourceItemId: "chat-1", bounds: { x: 10, y: 400, width: 200, height: 30 } }],
    },
  ], [{ sourceItemId: "chat-1", bounds: { x: 90, y: 90, width: 240, height: 180 } }]);

  assert.deepEqual(groups[0].lines, ["ค่อยโอนทีเดียว ไม่เป็นไร"]);
  assert.deepEqual(findChatSlipCorroborationCandidates({ slips: [slip], chatPages: [{ pageNumber: 3, groups }] }), []);
});

test("does not use an OCR group that mixes embedded-slip evidence with chat text", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [slip],
    chatPages: [{ pageNumber: 3, groups: [{
      groupId: "mixed-group",
      lines: ["Ref Afelcd222498c42a5", "ค่อยโอนทีเดียว ไม่เป็นไร"],
      overlapsEmbeddedSlip: true,
    }] }],
  });
  assert.deepEqual(result, []);
});

test("offers a visual similarity candidate only for a chat-embedded slip matched to a standalone slip", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "master-slip", amount: 5000, referenceNo: null }],
    visualMatches: [{ chatSlipId: "embedded-slip", masterSlipId: "master-slip", chatSourceItemId: "chat-source-7", chatPageNumber: 7, distance: 3 }],
  });
  assert.deepEqual(result, [{
    slipId: "master-slip",
    chatPageNumber: 7,
    chatSourceItemId: "chat-source-7",
    groupId: "visual-embedded-slip",
    matchBasis: "visual_similarity",
    evidenceText: "",
    needsReview: true,
    similarityDistance: 3,
  }]);
});

test("rejects visual matches outside the threshold or without both source records", () => {
  const result = findChatSlipCorroborationCandidates({
    slips: [{ id: "master-slip", amount: 5000, referenceNo: null }],
    visualMatches: [
      { chatSlipId: "embedded-a", masterSlipId: "master-slip", chatPageNumber: 7, distance: 9 },
      { chatSlipId: "embedded-b", masterSlipId: "missing-slip", chatPageNumber: 8, distance: 1 },
      { chatSlipId: "embedded-c", masterSlipId: "master-slip", chatPageNumber: null, distance: 1 },
    ],
  });
  assert.deepEqual(result, []);
});

test("renders a legal-intent candidate as legal evidence rather than a pHash match", () => {
  assert.equal(getCorroborationBasisLabel({ matchBasis: "amount_with_legal_intent" }), "ยอด + ข้อความกู้ยืม/หนี้ · ไม่มีเวลาเทียบ");
  assert.equal(getCorroborationBasisLabel({ matchBasis: "amount_with_legal_intent_and_time_window", timeProximityMinutes: 12 }), "ยอด + ข้อความกู้ยืม/หนี้ · 12 นาที");
});

