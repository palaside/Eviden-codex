import test from "node:test";
import assert from "node:assert/strict";
import { matchLegalSignalsInText } from "../legal-signal-matcher.mjs";

test("finds a review-only signal from OCR text", () => {
  const hits = matchLegalSignalsInText("ขอยืมเงิน 8,000 บาท เดี๋ยวคืนให้");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].reviewStatus, "human_review_required");
  assert.equal(hits[0].legalDecision, false);
});

test("does not turn unrelated OCR into a legal hit", () => {
  assert.deepEqual(matchLegalSignalsInText("สวัสดีครับ วันนี้อากาศดี"), []);
});

test("includes the imported RAW reference as a review-only source", () => {
  const hits = matchLegalSignalsInText("การันตีผลกำไร งานง่ายได้เงินไว");
  const rawHit = hits.find((hit) => hit.sourceKind === "raw_thai_law_master_reference");
  assert.ok(rawHit);
  assert.equal(rawHit.reviewStatus, "human_review_required");
  assert.equal(rawHit.legalDecision, false);
  assert.equal(rawHit.sourceVersion, "1.1.0");
  assert.ok(rawHit.sourceStatus);
});
