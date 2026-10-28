import assert from "node:assert/strict";
import test from "node:test";
import { reconcileReviewedDuplicateReferences } from "./confirmed-ledger.ts";

const records = [
  { id: "master", isConfirmed: true, amount: 500, referenceNo: "REF-1" },
  { id: "copy", isConfirmed: true, amount: 500, referenceNo: "ref-1" },
  { id: "other", isConfirmed: true, amount: 200, referenceNo: "REF-2" },
];

test("keeps repeated-reference gross intact until a reviewer resolves the group", () => {
  const result = reconcileReviewedDuplicateReferences(records, {});

  assert.equal(result.grossConfirmedAmount, 1200);
  assert.equal(result.reviewedExcludedAmount, 0);
  assert.equal(result.reviewedNetAmount, 1200);
  assert.equal(result.unresolvedGroupCount, 1);
});

test("excludes only explicitly reviewed copies from reviewed net, never from gross", () => {
  const result = reconcileReviewedDuplicateReferences(records, {
    "REF-1": { disposition: "duplicate", masterOccurrenceId: "master", occurrenceIds: ["master", "copy"] },
  });

  assert.equal(result.grossConfirmedAmount, 1200);
  assert.equal(result.reviewedExcludedAmount, 500);
  assert.equal(result.reviewedNetAmount, 700);
  assert.deepEqual(result.excludedOccurrenceIds, ["copy"]);
  assert.equal(result.resolvedDuplicateGroupCount, 1);
  assert.equal(result.unresolvedGroupCount, 0);
});

test("records explicit distinct-transaction review without subtracting a repeated reference", () => {
  const result = reconcileReviewedDuplicateReferences(records, {
    "REF-1": { disposition: "distinct", occurrenceIds: ["master", "copy"] },
  });

  assert.equal(result.grossConfirmedAmount, 1200);
  assert.equal(result.reviewedExcludedAmount, 0);
  assert.equal(result.reviewedNetAmount, 1200);
  assert.equal(result.distinctGroupCount, 1);
  assert.equal(result.unresolvedGroupCount, 0);
});

test("ignores stale master choices and refuses exclusion when a confirmed amount is missing", () => {
  const stale = reconcileReviewedDuplicateReferences(records, {
    "REF-1": { disposition: "duplicate", masterOccurrenceId: "not-in-group", occurrenceIds: ["master", "copy"] },
  });
  assert.equal(stale.reviewedExcludedAmount, 0);
  assert.equal(stale.unresolvedGroupCount, 1);

  const missingAmount = reconcileReviewedDuplicateReferences([
    ...records,
    { id: "copy-no-amount", isConfirmed: true, amount: null, referenceNo: "REF-2" },
  ], {
    "REF-2": { disposition: "duplicate", masterOccurrenceId: "other", occurrenceIds: ["other", "copy-no-amount"] },
  });
  assert.equal(missingAmount.reviewedExcludedAmount, 0);
  assert.equal(missingAmount.unresolvedGroupCount, 2);
});

test("requires renewed review when a repeated-reference group gains an occurrence", () => {
  const result = reconcileReviewedDuplicateReferences([
    ...records,
    { id: "new-copy", isConfirmed: true, amount: 500, referenceNo: "REF-1" },
  ], {
    "REF-1": { disposition: "duplicate", masterOccurrenceId: "master", occurrenceIds: ["master", "copy"] },
  });

  assert.equal(result.reviewedExcludedAmount, 0);
  assert.equal(result.unresolvedGroupCount, 1);
});

test("ignores unresolved, pending, and synthetic-reference occurrences in the reconciliation", () => {
  const result = reconcileReviewedDuplicateReferences([
    ...records,
    { id: "pending", isConfirmed: false, amount: 700, referenceNo: "REF-1" },
    { id: "synthetic-a", isConfirmed: true, amount: 20, referenceNo: "CHAT-1" },
    { id: "synthetic-b", isConfirmed: true, amount: 20, referenceNo: "CHAT-1" },
  ], {});

  assert.equal(result.grossConfirmedAmount, 1240);
  assert.equal(result.reviewedExcludedAmount, 0);
  assert.equal(result.unresolvedGroupCount, 1);
});
