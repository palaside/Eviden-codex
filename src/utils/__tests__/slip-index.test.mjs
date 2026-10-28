import assert from "node:assert/strict";
import test from "node:test";
import { buildSlipIndex, buildSlipIndexMarkdown, filterSlipRecordsBySourceItemIds, makePdfPageMapKey, prepareNamedGroupSlipIndex, prepareSlipRecordArtifact } from "../slip-index.mjs";

function record(overrides = {}) {
  return {
    id: "candidate-1",
    source: "slip.png",
    sha256: "a".repeat(64),
    chatPage: "-",
    dossierPage: 4,
    bounds: { x: 10, y: 20, width: 30, height: 40 },
    isConfirmed: false,
    needsReview: true,
    data: {
      bank: { name: "Bank A" },
      transaction: { reference_no: "REF-1234", date: "2025-06-09", time: "14:45", amount: 5000, currency: "THB" },
      sender: { name: "Sender", bank: "Bank A", account_no: "xxx5266" },
      receiver: { name: "Receiver", bank: "Bank B", account_no: "xxx9965" },
      confidence: { amount: 0.9 },
    },
    ...overrides,
  };
}

test("filters slip index records by source item identity, not repeated filename", () => {
  const left = record({ id: "left-candidate", sourceItemId: "left-file", source: "chat.png" });
  const right = record({ id: "right-candidate", sourceItemId: "right-file", source: "chat.png" });

  assert.deepEqual(filterSlipRecordsBySourceItemIds([left, right], ["right-file"]), [right]);
});

test("prepares one named-group JSON artifact with only that group's source records", () => {
  const left = record({ id: "left-candidate", sourceItemId: "left-file", source: "chatv3 (73).jpg" });
  const right = record({ id: "right-candidate", sourceItemId: "right-file", source: "chatv3 (77).jpg" });

  const artifact = prepareNamedGroupSlipIndex([left, right], {
    label: "chatv3",
    outputStem: "chatv3",
    itemIds: ["right-file"],
  }, "CASE-1");
  const index = JSON.parse(artifact.json);

  assert.equal(artifact.fileName, "Evidence_Chat_chatv3_Slip_Index.json");
  assert.equal(index.case_number, "CASE-1 · chatv3");
  assert.equal(index.candidate_count, 1);
  assert.equal(index.transactions[0].occurrences[0].source_file, "chatv3 (77).jpg");
});

test("builds a stable, traceable slip index with review status and source coordinates", () => {
  const index = buildSlipIndex([record()], "CASE-1", "2026-10-08T00:00:00Z");
  assert.equal(index.index_type, "app_detected_slip_candidates");
  assert.equal(index.candidate_count, 1);
  assert.equal(index.transaction_count, 1);
  assert.equal(index.transactions[0].needs_review, true);
  assert.deepEqual(index.transactions[0].dossier_pages, [4]);
  assert.deepEqual(index.transactions[0].occurrences[0].source_bounds, { x: 10, y: 20, width: 30, height: 40 });
  assert.match(index.source, /not a raster rescan/);
});

test("exports per-occurrence fallback metadata in the versioned slip index", () => {
  const index = buildSlipIndex([record({ needsReview: false })], "CASE-1", "2026-10-08T00:00:00Z");
  const occurrence = index.transactions[0].occurrences[0];

  assert.equal(index.schema_version, "1.2");
  assert.equal(occurrence.needs_review, true);
  assert.equal(occurrence._fallback_meta.needs_human_review, true);
  assert.ok(occurrence._fallback_meta.unclear_fields.includes("transaction.note"));
});

test("exports one complete traceable slip record per candidate, including repeated transaction images", () => {
  const first = record({ id: "candidate-1", source: "slip-a.png", isConfirmed: true });
  const second = record({ id: "candidate-2", source: "slip-b.png", dossierPage: 8 });
  const index = buildSlipIndex([first, second], "CASE-1", "2026-10-08T00:00:00Z");

  assert.equal(index.schema_version, "1.2");
  assert.equal(index.transaction_count, 1);
  assert.equal(index.candidate_count, 2);
  assert.equal(index.slip_records.length, 2);
  assert.deepEqual(index.slip_records.map((item) => item.candidate_id), ["candidate-1", "candidate-2"]);
  assert.deepEqual(index.slip_records.map((item) => item.source_file), ["slip-a.png", "slip-b.png"]);
  assert.equal(index.slip_records[0].transaction.amount, 5000);
  assert.equal(index.slip_records[0].sender.name, "Sender");
  assert.equal(index.slip_records[0].receiver.account_no, "xxx9965");
  assert.equal(index.slip_records[1].transaction.reference_no, "REF-1234");
  assert.equal(index.slip_records[1].is_confirmed, false);
  assert.equal(index.slip_records[1].needs_review, true);
  assert.equal(index.slip_records[1]._fallback_meta.needs_human_review, true);
});

test("prepares a standalone JSON artifact for one source image with a collision-resistant safe filename", () => {
  const sourceRecord = record({ id: "candidate/2", source: "slip (copy).png" });
  const artifact = prepareSlipRecordArtifact(sourceRecord, "Case / 12", {}, "2026-10-08T00:00:00Z");
  const payload = JSON.parse(artifact.json);

  assert.match(artifact.fileName, /^Digital_Evidence_Case_12_slip_copy_candidate_2\.json$/);
  assert.equal(payload.candidate_count, 1);
  assert.equal(payload.slip_records.length, 1);
  assert.equal(payload.slip_records[0].candidate_id, "candidate/2");
  assert.equal(payload.slip_records[0].source_file, "slip (copy).png");
  assert.equal(payload.slip_records[0].transaction.amount, 5000);
  assert.equal(payload.slip_records[0].sender.name, "Sender");
});

test("groups the same real reference only when amount, date, and bank also agree", () => {
  const first = record();
  const second = record({ id: "candidate-2", dossierPage: 9, data: {
    ...first.data,
    transaction: { ...first.data.transaction, reference_no: "ref1234" },
  } });
  const conflict = record({ id: "candidate-3", dossierPage: 10, data: {
    ...first.data,
    transaction: { ...first.data.transaction, amount: 4000 },
  } });
  const index = buildSlipIndex([first, second, conflict], "CASE-1");
  assert.equal(index.transaction_count, 2);
  assert.equal(index.transactions[0].occurrence_count, 2);
  assert.deepEqual(index.transactions[0].dossier_pages, [4, 9]);
  assert.equal(index.transactions[1].amount, 4000);
});

test("does not deduplicate candidates without a real reference or with a generated reference", () => {
  const first = record({ id: "candidate-1", data: { ...record().data, transaction: { ...record().data.transaction, reference_no: null } } });
  const second = record({ id: "candidate-2", data: { ...record().data, transaction: { ...record().data.transaction, reference_no: "SLIP-0002" } } });
  const third = { ...second, id: "candidate-3", dossierPage: 6 };
  const index = buildSlipIndex([first, second, third], "CASE-1");
  assert.equal(index.candidate_count, 3);
  assert.equal(index.transaction_count, 3);
});

test("renders all 13 app ledger columns and escapes markdown cell delimiters", () => {
  const index = buildSlipIndex([record({ source: "page|one.png", chatPage: "หน้า 2", data: {
    ...record().data,
    sender: { name: "Sender", bank: "Bank A", account_no: "xxx5266" },
    receiver: { name: "Receiver", bank: "Bank B", account_no: "xxx9965" },
  } })], "CASE-1", "2026-10-08T00:00:00Z");
  const markdown = buildSlipIndexMarkdown(index);
  const header = markdown.split("\n").find((line) => line.startsWith("| ลำดับ |"));
  assert.equal(header.split("|").length - 2, 13);
  assert.match(markdown, /page\\\|one\.png/);
  assert.match(markdown, /2025-06-09 14:45/);
  assert.match(markdown, /รอตรวจทาน/);
});

test("renders an empty index without inventing slip rows", () => {
  const markdown = buildSlipIndexMarkdown(buildSlipIndex([], "CASE-1", "2026-10-08T00:00:00Z"));
  assert.match(markdown, /0 รายการธุรกรรม จาก 0 OCR candidates/);
  assert.equal(markdown.split("\n").filter((line) => line.startsWith("| 1 |" )).length, 0);
});

test("includes an actual PDF physical page only when its source label mapped uniquely", () => {
  const indexedRecord = record({ source: "chat.png", chatPage: "1 / 2" });
  const key = makePdfPageMapKey(indexedRecord.source, indexedRecord.sha256, indexedRecord.chatPage);
  const index = buildSlipIndex([indexedRecord], "CASE-1", "2026-10-08T00:00:00Z", { [key]: 5 });
  assert.equal(index.transactions[0].occurrences[0].pdf_page_number, 5);
  assert.deepEqual(index.transactions[0].pdf_pages, [5]);
  assert.match(buildSlipIndexMarkdown(index), /PDF 5 · A4 4/);

  const unmapped = buildSlipIndex([indexedRecord], "CASE-1", "2026-10-08T00:00:00Z");
  assert.equal(unmapped.transactions[0].occurrences[0].pdf_page_number, null);
  assert.deepEqual(unmapped.transactions[0].pdf_pages, []);
});
