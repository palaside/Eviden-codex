import assert from "node:assert/strict";
import test from "node:test";
import { resolveEvidencePageType, resolveHeaderCorroborated, resolveHeaderMode, resolveWebHeaderStatus } from "../forensic-header-machine.ts";

test("uses the active evidence category instead of the manually selected mode", () => {
  assert.equal(resolveEvidencePageType("SLIP", "CHAT", true), "SLIP");
  assert.equal(resolveEvidencePageType("CHAT", "SLIP", true), "CHAT");
  assert.equal(resolveEvidencePageType("PENDING", "CHAT", true), "CHAT");
  assert.equal(resolveEvidencePageType("SLIP", "CHAT", false), "STANDBY");
});

test("does not label an active standalone slip as chat even when CHAT is selected", () => {
  const pageType = resolveEvidencePageType("SLIP", "CHAT", true);
  assert.equal(pageType, "SLIP");
  assert.equal(resolveHeaderMode(pageType, true), "SLIP");
});

test("clarifies that CHAT + SLIP is a chat screenshot with an embedded slip", () => {
  assert.equal(resolveHeaderMode("CHAT", true), "CHAT SCREEN + EMBEDDED SLIP");
  assert.equal(resolveHeaderCorroborated({ type: "CHAT", chatHasSlip: true }), "ภาพแชทที่มีภาพสลิปประกอบ");
});

test("keeps chat-only sources identified as chat", () => {
  assert.equal(resolveHeaderMode("CHAT", false), "CHAT");
  assert.equal(resolveHeaderCorroborated({ type: "CHAT", chatHasSlip: false }), "บทสนทนาทั่วไปในคดี (บริบทความสัมพันธ์แห่งคดี)");
});

test("labels the header slip count as confirmed, not all detected candidates", () => {
  const status = resolveWebHeaderStatus({
    loading: false,
    evidence: {
      totalNetLoss: 0,
      slipCount: 0,
      chatPageCount: 3,
      poiName: null,
      poiLossSum: 0,
      corroboratedPairsCount: 0,
      duplicateCount: 0,
      processedAt: null,
    },
  });

  assert.equal(status.text, "ยืนยันสลิป 0 รายการ • แชท 3 หน้า");
});
