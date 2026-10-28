import assert from "node:assert/strict";
import test from "node:test";
import { buildNetReconciliationDossier } from "./net-reconciliation-dossier.mjs";

const summary = {
  grossConfirmedAmount: 1000,
  reviewedExcludedAmount: 500,
  reviewedNetAmount: 500,
  excludedOccurrenceIds: ["copy"],
  resolvedDuplicateGroupCount: 1,
  distinctGroupCount: 0,
  unresolvedGroupCount: 0,
  groups: [{
    referenceNo: "REF-1",
    occurrenceIds: ["master", "copy"],
    occurrenceCount: 2,
    grossAmount: 1000,
    disposition: "duplicate",
    masterOccurrenceId: "master",
    excludedOccurrenceIds: ["copy"],
    excludedAmount: 500,
  }],
};

const occurrences = [
  { id: "master", source: "source-a.png", sha256: "a".repeat(64), isConfirmed: true, amount: 500, referenceNo: "REF-1", dossierPage: 5 },
  { id: "copy", source: "source-b.png", sha256: "b".repeat(64), isConfirmed: true, amount: 500, referenceNo: "REF-1", dossierPage: 8 },
  { id: "pending", source: "source-c.png", sha256: "c".repeat(64), isConfirmed: false, amount: 700, referenceNo: "REF-P" },
];

test("builds an auditable NET review dossier without changing source occurrence statuses", () => {
  const dossier = buildNetReconciliationDossier({
    caseNumber: "Case 12/2569",
    generatedAt: "2026-10-10T12:00:00.000Z",
    occurrences,
    summary,
  });

  assert.equal(dossier.schema_version, "1.0");
  assert.equal(dossier.totals.gross_confirmed_amount, 1000);
  assert.equal(dossier.totals.reviewed_excluded_amount, 500);
  assert.equal(dossier.totals.reviewed_net_amount, 500);
  assert.equal(dossier.occurrences.length, 3);
  assert.equal(dossier.occurrences[2].status, "pending_review");
  assert.deepEqual(dossier.reference_groups[0].excluded_occurrence_ids, ["copy"]);
  assert.equal(dossier.reference_groups[0].master_occurrence_id, "master");
  assert.equal(dossier.automatic_deduplication, false);
});

test("exports unresolved repeated references without excluding any amount", () => {
  const unresolvedSummary = {
    ...summary,
    reviewedExcludedAmount: 0,
    reviewedNetAmount: 1000,
    excludedOccurrenceIds: [],
    resolvedDuplicateGroupCount: 0,
    unresolvedGroupCount: 1,
    groups: [{ ...summary.groups[0], disposition: "unresolved", masterOccurrenceId: undefined, excludedOccurrenceIds: [], excludedAmount: 0 }],
  };
  const dossier = buildNetReconciliationDossier({
    caseNumber: "Case",
    generatedAt: "2026-10-10T12:00:00.000Z",
    occurrences,
    summary: unresolvedSummary,
  });

  assert.equal(dossier.totals.reviewed_excluded_amount, 0);
  assert.equal(dossier.totals.reviewed_net_amount, 1000);
  assert.equal(dossier.totals.unresolved_duplicate_groups, 1);
  assert.equal(dossier.reference_groups[0].disposition, "unresolved");
});

test("does not export sender/receiver names or account numbers in the NET review dossier", () => {
  const dossier = buildNetReconciliationDossier({
    caseNumber: "Case",
    generatedAt: "2026-10-10T12:00:00.000Z",
    occurrences: [{ ...occurrences[0], senderName: "private sender", receiverName: "private receiver", accountNo: "123456" }],
    summary,
  });
  const json = JSON.stringify(dossier);

  assert.equal(json.includes("private sender"), false);
  assert.equal(json.includes("private receiver"), false);
  assert.equal(json.includes("123456"), false);
});
