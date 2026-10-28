import assert from "node:assert/strict";
import test from "node:test";
import { buildDuplicateAuditMatrix, filterVisualPairsByTransactionAnchors } from "./duplicate-audit-matrix.mjs";
import { mapStreamBoundsToSources } from "./map-stream-bounds.ts";

const record = (id, overrides = {}) => ({
  id,
  source: `${id}.png`,
  chatPage: "-",
  dossierPage: 4,
  sha256: `sha-${id}`,
  referenceNo: `REF-${id}`,
  date: "2025-06-09",
  time: "14:45",
  amount: 5000,
  senderAccount: "XXX-X-XX526-6",
  receiverAccount: "XXX-X-XX996-5",
  ...overrides,
});

test("builds a cross-reference row with all matching dimensions and exact locations", () => {
  const result = buildDuplicateAuditMatrix([
    record("master", { sha256: "same-sha", referenceNo: "REF-1" }),
    record("copy", { sha256: "same-sha", referenceNo: " ref-1 ", chatPage: "7 / 8", dossierPage: 10 }),
  ], [{ leftId: "master", rightId: "copy", distance: 2 }]);

  assert.equal(result.summary.duplicateOccurrenceCount, 1);
  assert.equal(result.summary.totalOccurrenceCount, 2);
  assert.equal(result.summary.withoutDuplicateSignalCount, 1);
  assert.deepEqual(result.summary.affectedPages, ["CHAT:7 / 8", "A4:4", "A4:10"]);
  assert.deepEqual(result.rows[0].masterCandidates, [{
    occurrenceId: "master",
    source: "master.png",
    chatPage: "-",
    dossierPage: 4,
    locations: ["A4:4"],
    reasons: ["exact_file_sha256", "reference_id", "transaction_payload_5d", "perceptual_image"],
    perceptualDistance: 2,
  }]);
  assert.equal(result.rows[0].reviewOnly, true);
  assert.equal(result.rows[0].status, "review");
});

test("reports total and unflagged occurrence counts without treating missing signals as proof", () => {
  const empty = buildDuplicateAuditMatrix([]);
  assert.deepEqual(empty.summary, {
    totalOccurrenceCount: 0,
    duplicateOccurrenceCount: 0,
    withoutDuplicateSignalCount: 0,
    affectedPages: [],
    affectedPageCount: 0,
  });

  const result = buildDuplicateAuditMatrix([
    record("first", { referenceNo: "REF-1" }),
    record("possible-copy", { referenceNo: "REF-1" }),
    record("unmatched", { referenceNo: "REF-3", date: null }),
  ]);
  assert.equal(result.summary.totalOccurrenceCount, 3);
  assert.equal(result.summary.duplicateOccurrenceCount, 1);
  assert.equal(result.summary.withoutDuplicateSignalCount, 2);
  assert.equal(result.rows[0].reviewOnly, true);
});

test("uses complete five-field transaction payload as a review signal without excluding it", () => {
  const result = buildDuplicateAuditMatrix([
    record("master", { referenceNo: "REF-A" }),
    record("copy", { referenceNo: "REF-B", date: "2025-06-09", amount: 5000 }),
  ]);

  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].masterCandidates[0].reasons, ["transaction_payload_5d"]);
  assert.equal(result.rows[0].reviewOnly, true);
});

test("does not fingerprint incomplete payloads or generated reference identifiers", () => {
  const result = buildDuplicateAuditMatrix([
    record("master", { referenceNo: "SLIP-1", senderAccount: null }),
    record("copy", { referenceNo: "SLIP-1", receiverAccount: "" }),
  ]);

  assert.deepEqual(result.rows, []);
});

test("does not classify same-template images as duplicate when explicit references differ", () => {
  const result = buildDuplicateAuditMatrix([
    record("slip-1", { referenceNo: "REF-100", amount: 3000 }),
    record("slip-2", { referenceNo: "REF-200", amount: 7200 }),
  ], [{ leftId: "slip-1", rightId: "slip-2", distance: 1 }]);

  assert.deepEqual(result.rows, []);
});

test("does not use a similar image to link transactions with different timestamps", () => {
  const result = buildDuplicateAuditMatrix([
    record("slip-1", { referenceNo: null, date: "2025-06-09", time: "14:45" }),
    record("slip-2", { referenceNo: null, date: "2025-06-10", time: "14:45" }),
  ], [{ leftId: "slip-1", rightId: "slip-2", distance: 1 }]);

  assert.deepEqual(result.rows, []);
});

test("filters same-template visual suggestions when transaction references or timestamps conflict", () => {
  const records = [
    record("ref-a", { referenceNo: "REF-A" }),
    record("ref-b", { referenceNo: "REF-B" }),
    record("time-a", { referenceNo: null, date: "2025-06-09", time: "14:45" }),
    record("time-b", { referenceNo: null, date: "2025-06-10", time: "14:45" }),
    record("same", { referenceNo: "SLIP-generated" }),
  ];
  const pairs = [
    { leftId: "ref-a", rightId: "ref-b", distance: 1 },
    { leftId: "time-a", rightId: "time-b", distance: 1 },
    { leftId: "same", rightId: "time-a", distance: 2 },
    { leftId: "missing", rightId: "time-a", distance: 2 },
  ];

  assert.deepEqual(filterVisualPairsByTransactionAnchors(pairs, records), [pairs[2]]);
});

test("does not call multiple slip occurrences from the same chat image exact-file duplicates", () => {
  const result = buildDuplicateAuditMatrix([
    record("slip-a", { sourceItemId: "chat-image", source: "chat.png", sha256: "same-source" }),
    record("slip-b", { sourceItemId: "chat-image", source: "chat.png", sha256: "same-source", referenceNo: "REF-B", amount: 1200 }),
  ]);

  assert.deepEqual(result.rows, []);
});

test("keeps multiple possible masters explicit instead of arbitrarily selecting one", () => {
  const result = buildDuplicateAuditMatrix([
    record("master-ref", { referenceNo: "REF-SHARED", amount: 1000 }),
    record("master-payload", { referenceNo: "REF-OTHER", amount: 2000 }),
    record("ambiguous-copy", { referenceNo: "REF-SHARED", amount: 2000, dossierPage: 12 }),
  ]);

  const row = result.rows.find(({ occurrenceId }) => occurrenceId === "ambiguous-copy");
  assert.equal(row.status, "ambiguous");
  assert.equal(row.masterOccurrenceId, null);
  assert.deepEqual(row.masterCandidates.map(({ occurrenceId }) => occurrenceId), ["master-ref", "master-payload"]);
});

test("flags near-identical source bounds repeated across chat pages for review only", () => {
  const sourceBounds = { x: 120, y: 640, width: 300, height: 520 };
  const result = buildDuplicateAuditMatrix([
    record("page-1", {
      sourceItemId: "chat-source",
      source: "chat.png",
      chatPage: "1 / 2",
      dossierPage: 4,
      bounds: sourceBounds,
      referenceNo: null,
      date: null,
      time: null,
      amount: null,
      senderAccount: null,
      receiverAccount: null,
    }),
    record("page-2", {
      sourceItemId: "chat-source",
      source: "chat.png",
      chatPage: "2 / 2",
      dossierPage: 5,
      bounds: { ...sourceBounds, x: 122, y: 642, width: 298, height: 518 },
      referenceNo: null,
      date: null,
      time: null,
      amount: null,
      senderAccount: null,
      receiverAccount: null,
    }),
  ]);

  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].masterCandidates[0].reasons, ["same_source_region_across_pages"]);
  assert.equal(result.rows[0].reviewOnly, true);
  assert.equal(result.rows[0].status, "review");
});

test("does not flag source-region overlap on the same page or across different source files", () => {
  const base = {
    sourceItemId: "source-a",
    bounds: { x: 10, y: 20, width: 200, height: 300 },
    referenceNo: null,
    date: null,
    time: null,
    amount: null,
    senderAccount: null,
    receiverAccount: null,
  };
  const samePage = buildDuplicateAuditMatrix([
    record("a", { ...base, chatPage: "1 / 2" }),
    record("b", { ...base, chatPage: "1 / 2", dossierPage: 5 }),
  ]);
  const differentSources = buildDuplicateAuditMatrix([
    record("a", { ...base, chatPage: "1 / 2" }),
    record("b", { ...base, sourceItemId: "source-b", chatPage: "2 / 2", dossierPage: 5 }),
  ]);

  assert.deepEqual(samePage.rows, []);
  assert.deepEqual(differentSources.rows, []);
});

test("carries stitched-stream bounds through source mapping into cross-page duplicate review", () => {
  const sourceSegments = [
    { sourceItemId: "same-chat", sourceFileName: "chat.png", sourceSha256: "sha-chat", streamStartY: 0, streamEndY: 1000, sourceOffsetY: 0, sourceScale: 1 },
    { sourceItemId: "same-chat", sourceFileName: "chat.png", sourceSha256: "sha-chat", streamStartY: 1000, streamEndY: 2000, sourceOffsetY: 0, sourceScale: 1 },
  ];
  const firstBounds = mapStreamBoundsToSources({ x: 120, y: 640, width: 300, height: 520 }, sourceSegments.slice(0, 1)).primary.sourceBounds;
  const secondBounds = mapStreamBoundsToSources({ x: 122, y: 1642, width: 298, height: 518 }, sourceSegments.slice(1)).primary.sourceBounds;
  const result = buildDuplicateAuditMatrix([
    record("page-1", { sourceItemId: "same-chat", chatPage: "1 / 2", bounds: firstBounds, referenceNo: null, date: null, time: null, amount: null, senderAccount: null, receiverAccount: null }),
    record("page-2", { sourceItemId: "same-chat", chatPage: "2 / 2", dossierPage: 5, bounds: secondBounds, referenceNo: null, date: null, time: null, amount: null, senderAccount: null, receiverAccount: null }),
  ]);

  assert.deepEqual(firstBounds, { x: 120, y: 640, width: 300, height: 360 });
  assert.deepEqual(secondBounds, { x: 122, y: 642, width: 298, height: 358 });
  assert.deepEqual(result.rows[0].masterCandidates[0].reasons, ["same_source_region_across_pages"]);
});
