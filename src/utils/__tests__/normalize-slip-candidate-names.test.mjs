import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSlipCandidateNames } from "../normalize-slip-candidate-names.ts";

test("normalizes party name prefixes after extraction and preserves raw OCR evidence", () => {
  const candidate = {
    data: {
      sender: { name: "นาย สมชาย ใจดี", bank: "KBANK", account_no: "xxx-1" },
      receiver: { name: "น.ส. สมหญิง รักดี", bank: "SCB", account_no: "xxx-2" },
      confidence: { sender_name: 0.91, receiver_name: 0.88 },
      raw_text: ["ผู้โอน นาย สมชาย ใจดี", "ผู้รับ น.ส. สมหญิง รักดี"],
      warnings: ["ocr-review"],
    },
    bounds: { x: 1, y: 2, width: 3, height: 4 },
    cropDataUrl: "data:image/png;base64,test",
  };

  const normalized = normalizeSlipCandidateNames(candidate);

  assert.equal(normalized.data.sender.name, "สมชาย ใจดี");
  assert.equal(normalized.data.receiver.name, "สมหญิง รักดี");
  assert.deepEqual(normalized.data.raw_text, candidate.data.raw_text);
  assert.deepEqual(normalized.data.confidence, candidate.data.confidence);
  assert.equal(normalized.data.sender.account_no, "xxx-1");
  assert.equal(normalized.data.receiver.account_no, "xxx-2");
  assert.equal(candidate.data.receiver.name, "น.ส. สมหญิง รักดี");
});

test("leaves names without recognized prefixes unchanged", () => {
  const candidate = { data: { sender: { name: "สมชาย" }, receiver: { name: null } } };

  const normalized = normalizeSlipCandidateNames(candidate);

  assert.equal(normalized.data.sender.name, "สมชาย");
  assert.equal(normalized.data.receiver.name, null);
});

test("retains the OCR-visible rank on a partially masked sender", () => {
  const candidate = {
    data: {
      sender: { name: "สืบตรีณัฐชัย s** *" },
      receiver: { name: null },
      raw_text: ["สืบตรีณัฐชัย s** *"],
    },
  };

  const normalized = normalizeSlipCandidateNames(candidate);

  assert.equal(normalized.data.sender.name, "สืบตรีณัฐชัย s** *");
  assert.deepEqual(normalized.data.raw_text, candidate.data.raw_text);
  assert.equal(candidate.data.sender.name, "สืบตรีณัฐชัย s** *");
});

test("keeps a masked sender as OCR saw it, even when an ordinal may be noise", () => {
  const candidate = {
    data: {
      sender: { name: "๑๐๑ สิบตรีณัฐชัยรา**" },
      receiver: { name: null },
      raw_text: ["๑๐๑ สิบตรีณัฐชัยรา**"],
    },
  };

  const normalized = normalizeSlipCandidateNames(candidate);

  assert.equal(normalized.data.sender.name, "๑๐๑ สิบตรีณัฐชัยรา**");
  assert.deepEqual(normalized.data.raw_text, candidate.data.raw_text);
  assert.equal(candidate.data.sender.name, "๑๐๑ สิบตรีณัฐชัยรา**");
});

test("normalizes QR-only fallback candidates without changing their raw OCR evidence", () => {
  const qrCandidate = {
    data: {
      sender: { name: "นาย สมชาย ใจดี" },
      receiver: { name: "น.ส. สมหญิง รักดี" },
      raw_text: ["นาย สมชาย ใจดี", "น.ส. สมหญิง รักดี"],
      confidence: { sender_name: 0, receiver_name: 0 },
    },
  };

  const fallbackCandidate = normalizeSlipCandidateNames(qrCandidate);

  assert.equal(fallbackCandidate.data.sender.name, "สมชาย ใจดี");
  assert.equal(fallbackCandidate.data.receiver.name, "สมหญิง รักดี");
  assert.deepEqual(fallbackCandidate.data.raw_text, qrCandidate.data.raw_text);
  assert.deepEqual(fallbackCandidate.data.confidence, qrCandidate.data.confidence);
});

test("preserves a visible sender title and masked suffix as the displayed evidence value", () => {
  const candidate = {
    data: {
      sender: { name: "สิบตรีณัฐชัย ร***" },
      receiver: { name: null },
      raw_text: ["จาก", "สิบตรีณัฐชัย ร***"],
    },
  };

  const normalized = normalizeSlipCandidateNames(candidate);

  assert.equal(normalized.data.sender.name, "สิบตรีณัฐชัย ร***");
  assert.deepEqual(normalized.data.raw_text, candidate.data.raw_text);
});
