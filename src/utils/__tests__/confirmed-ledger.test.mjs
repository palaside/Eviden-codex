import assert from "node:assert/strict";
import test from "node:test";
import { formatSlipReviewCounts, groupConfirmedSlipReferences, summarizeConfirmedSlipRecords } from "../confirmed-ledger.ts";

test("groups confirmed repeated references for review without choosing a master", () => {
  const groups = groupConfirmedSlipReferences([
    { id: "one", isConfirmed: true, amount: 100, referenceNo: " ref-a " },
    { id: "pending", isConfirmed: false, amount: 300, referenceNo: "REF-A" },
    { id: "two", isConfirmed: true, amount: 100, referenceNo: "REF-A" },
    { id: "three", isConfirmed: true, amount: 200, referenceNo: "ref-a" },
    { id: "system-a", isConfirmed: true, amount: 50, referenceNo: "CHAT-1" },
    { id: "system-b", isConfirmed: true, amount: 50, referenceNo: "chat-1" },
    { id: "no-ref", isConfirmed: true, amount: 99, referenceNo: "" },
  ]);

  assert.deepEqual(groups, [{
    referenceNo: "REF-A",
    occurrenceIds: ["one", "two", "three"],
    occurrenceCount: 3,
    grossAmount: 400,
  }]);
});

test("counts confirmed records even when reference numbers match", () => {
  const summary = summarizeConfirmedSlipRecords([
    { id: "pending", isConfirmed: false, amount: 9000, referenceNo: "PENDING" },
    { id: "one", isConfirmed: true, amount: 2000, referenceNo: "REF-1" },
    { id: "copy", isConfirmed: true, amount: 2000, referenceNo: " ref-1 " },
  ]);

  assert.deepEqual(summary, {
    detectedCount: 3,
    pendingCount: 1,
    slipCount: 2,
    duplicateCount: 1,
    totalAmount: 4000,
    potentialDuplicateAmount: 2000,
    provisionalNetAmount: 2000,
  });
});

test("labels pending slip candidates separately from confirmed slips", () => {
  const summary = summarizeConfirmedSlipRecords([
    { id: "pending-slip", isConfirmed: false, amount: 5000, referenceNo: "REF-PENDING" },
  ]);

  assert.equal(formatSlipReviewCounts(summary), "พบ 1 · ยืนยัน 0 รายการ");
});

test("does not infer duplicates when confirmed slips have no reference", () => {
  const summary = summarizeConfirmedSlipRecords([
    { id: "a", isConfirmed: true, amount: 150, referenceNo: null },
    { id: "b", isConfirmed: true, amount: 250, referenceNo: "" },
  ]);

  assert.deepEqual(summary, {
    detectedCount: 2,
    pendingCount: 0,
    slipCount: 2,
    duplicateCount: 0,
    totalAmount: 400,
    potentialDuplicateAmount: 0,
    provisionalNetAmount: 400,
  });
});

test("does not treat generated CHAT/SLIP identifiers as matching transaction references", () => {
  const summary = summarizeConfirmedSlipRecords([
    { id: "chat-a", isConfirmed: true, amount: 100, referenceNo: "CHAT-1" },
    { id: "chat-b", isConfirmed: true, amount: 100, referenceNo: "CHAT-1" },
    { id: "slip-a", isConfirmed: true, amount: 50, referenceNo: "SLIP-1" },
    { id: "slip-b", isConfirmed: true, amount: 50, referenceNo: "SLIP-1" },
  ]);

  assert.equal(summary.duplicateCount, 0);
  assert.equal(summary.potentialDuplicateAmount, 0);
  assert.equal(summary.totalAmount, 300);
});

test("sums the three confirmed reference slips to 2,200 and excludes pending candidates", () => {
  const summary = summarizeConfirmedSlipRecords([
    { id: "slip-1", isConfirmed: true, amount: 2000, referenceNo: "REF-1" },
    { id: "slip-2", isConfirmed: true, amount: 100, referenceNo: "REF-2" },
    { id: "slip-3", isConfirmed: true, amount: 100, referenceNo: "REF-3" },
    { id: "pending", isConfirmed: false, amount: 5000, referenceNo: "REF-PENDING" },
  ]);

  assert.equal(summary.detectedCount, 4);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.slipCount, 3);
  assert.equal(summary.totalAmount, 2200);
  assert.equal(summary.provisionalNetAmount, 2200);
});

test("does not subtract repeated references from the confirmed gross total", () => {
  const summary = summarizeConfirmedSlipRecords([
    { id: "original", isConfirmed: true, amount: 750, referenceNo: "REF-DUP" },
    { id: "review-copy", isConfirmed: true, amount: 750, referenceNo: "REF-DUP" },
    { id: "unconfirmed-copy", isConfirmed: false, amount: 750, referenceNo: "REF-DUP" },
  ]);

  assert.equal(summary.totalAmount, 1500);
  assert.equal(summary.potentialDuplicateAmount, 750);
  assert.equal(summary.provisionalNetAmount, 750);
  assert.equal(summary.duplicateCount, 1);
});
