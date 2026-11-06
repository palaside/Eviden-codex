import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createBatchRunManifest, writeAtomicJson, readCheckpoint,
  isCheckpointCompatible, getPendingFixtures,
} from "../batch500-contract.mjs";
import * as contract from "../batch500-contract.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const first = { fixturePath: "/fixtures/first.png", sourceSha256: sha("first"), size: 5 };
const second = { fixturePath: "/fixtures/second.png", sourceSha256: sha("second"), size: 6 };
const options = { runId: "run-one", buildId: "build-one", gitCommit: "commit-one", processingVersion: "local-v1", inventory: [first, second], batches: [{ batchId: "001", offset: 0, limit: 2 }] };
const manifest = () => createBatchRunManifest(options);
const checkpointFor = (run = manifest(), results = []) => ({ ...run, schema: "digital-evidence.batch500-checkpoint.v1", results });
// Keep scratch evidence; this suite never removes files or prior reports.
const scratch = () => fs.mkdtemp(path.join(os.tmpdir(), "batch500-contract-"));

test("run identity is deterministic across object key order and inventory ordering", () => {
  const actual = manifest();
  const reordered = createBatchRunManifest({ ...options, runId: "another-run", inventory: [{ size: 6, sourceSha256: second.sourceSha256, fixturePath: second.fixturePath }, first] });
  assert.match(actual.runIdentity, /^[a-f0-9]{64}$/);
  assert.equal(actual.runIdentity, reordered.runIdentity);
  assert.notEqual(actual.runIdentity, createBatchRunManifest({ ...options, buildId: "new" }).runIdentity);
  assert.notEqual(actual.runIdentity, createBatchRunManifest({ ...options, inventory: [{ ...first, sourceSha256: sha("changed") }, second] }).runIdentity);
  assert.equal(actual.inventory.length, 2);
});

test("missing identities and invalid source SHA are rejected", () => {
  for (const field of ["runId", "buildId", "gitCommit", "processingVersion"]) {
    assert.throws(() => createBatchRunManifest({ ...options, [field]: "" }), new RegExp(field));
  }
  assert.throws(() => createBatchRunManifest({ ...options, inventory: [{ ...first, sourceSha256: "unknown" }] }), /SHA/i);
});

test("duplicate SHA inventory preserves occurrences but pending processing deduplicates by SHA", () => {
  const duplicate = { ...first, fixturePath: "/fixtures/copy.png" };
  const run = createBatchRunManifest({ ...options, inventory: [first, duplicate, second] });
  assert.equal(run.inventory.length, 3);
  assert.deepEqual(getPendingFixtures(null, [first, duplicate, second]), [first, second]);
});

test("atomic JSON write supports absent parent and readable complete checkpoint updates", async () => {
  const dir = await scratch();
  const file = path.join(dir, "nested", "checkpoint.json");
  await writeAtomicJson(file, { ...manifest(), results: [] });
  assert.deepEqual(await readCheckpoint(file), { ...manifest(), results: [] });
  await writeAtomicJson(file, { ...manifest(), results: [{ ...first, status: "failed" }] });
  assert.equal((await readCheckpoint(file)).results[0].status, "failed");
  assert.deepEqual(await fs.readdir(path.dirname(file)), ["checkpoint.json"]);
});

test("readers see only old or new complete JSON while checkpoint is replaced", async () => {
  const dir = await scratch();
  const file = path.join(dir, "checkpoint.json");
  await writeAtomicJson(file, { revision: 0 });
  for (let revision = 1; revision <= 10; revision++) {
    const [, ...reads] = await Promise.all([
      writeAtomicJson(file, { revision, payload: "x".repeat(8192) }),
      ...Array.from({ length: 4 }, () => readCheckpoint(file)),
    ]);
    for (const read of reads) assert.ok(read.revision === revision - 1 || read.revision === revision);
  }
});

test("failed serialization preserves the prior checkpoint", async () => {
  const dir = await scratch();
  const file = path.join(dir, "checkpoint.json");
  await writeAtomicJson(file, { preserved: true });
  await assert.rejects(writeAtomicJson(file, { unsupported: 1n }));
  assert.deepEqual(await readCheckpoint(file), { preserved: true });
  assert.deepEqual(await fs.readdir(dir), ["checkpoint.json"]);
});

test("missing checkpoint returns null; corrupt or non-object JSON fails closed", async () => {
  const dir = await scratch();
  const file = path.join(dir, "checkpoint.json");
  assert.equal(await readCheckpoint(file), null);
  for (const data of ["{broken", "null", "[]", "42"]) {
    const fixture = path.join(dir, `${sha(data)}.json`);
    await fs.writeFile(fixture, data, { flag: "wx" });
    await assert.rejects(readCheckpoint(fixture));
  }
});

test("compatible checkpoint permits a different run label and result progress", () => {
  const run = manifest();
  assert.deepEqual(isCheckpointCompatible({ ...checkpointFor(run), runId: "resume" }, run), { compatible: true, reasons: [] });
});

test("compatibility requires supported manifest and checkpoint schemas even when unknown schemas match", () => {
  const run = manifest();
  const checkpoint = checkpointFor(run);
  for (const schema of [undefined, "", "unknown", "digital-evidence.batch500-run.v2"]) {
    assert.equal(isCheckpointCompatible({ ...checkpoint, schema }, { ...run, schema }).compatible, false);
    const invalidManifest = isCheckpointCompatible(checkpoint, { ...run, schema });
    assert.equal(invalidManifest.compatible, false);
    assert.ok(invalidManifest.reasons.some((reason) => reason.includes("manifest schema")));
    const invalidCheckpoint = isCheckpointCompatible({ ...checkpoint, schema }, run);
    assert.equal(invalidCheckpoint.compatible, false);
    assert.ok(invalidCheckpoint.reasons.some((reason) => reason.includes("checkpoint schema")));
  }
  assert.equal(isCheckpointCompatible({ ...checkpoint, schema: run.schema }, run).compatible, false);
});

test("incompatible build, commit, processing version, inventory and batch layout are explained", () => {
  const run = manifest();
  for (const [field, replacement] of Object.entries({ buildId: "other", gitCommit: "other", processingVersion: "other", inventory: [first], batches: [] })) {
    const result = isCheckpointCompatible({ ...checkpointFor(run), [field]: replacement }, run);
    assert.equal(result.compatible, false, field);
    assert.ok(result.reasons.some((reason) => reason.includes(field)), field);
  }
  assert.equal(isCheckpointCompatible(null, run).compatible, false);
  assert.equal(isCheckpointCompatible({}, run).compatible, false);
});

test("pending skips only completed SHA with parseable matching trace; uncertain and failed stay pending", async () => {
  const dir = await scratch();
  const tracePath = path.join(dir, "trace.json");
  await fs.writeFile(tracePath, JSON.stringify({ items: [{ source: { sha256: first.sourceSha256 }, candidates: [] }] }), { flag: "wx" });
  const completed = { ...first, status: "completed", processingStatus: "completed", tracePath };
  assert.deepEqual(getPendingFixtures({ results: [completed] }, [first, second]), [second]);
  for (const status of ["failed", "not_run", "skipped_duplicate"]) {
    assert.deepEqual(getPendingFixtures({ results: [{ ...completed, status }] }, [first]), [first]);
  }
  for (const record of [{ ...completed, tracePath: "missing-trace.json" }, { ...completed, sourceSha256: second.sourceSha256 }]) {
    assert.deepEqual(getPendingFixtures({ results: [record] }, [first, second]), [first, second]);
  }
  const corruptPath = path.join(dir, "corrupt.json");
  await fs.writeFile(corruptPath, "{broken", { flag: "wx" });
  assert.deepEqual(getPendingFixtures({ results: [{ ...completed, tracePath: corruptPath }] }, [first]), [first]);
  for (const processingStatus of [undefined, "not_run", "failed"]) {
    assert.deepEqual(getPendingFixtures({ results: [{ ...completed, status: "review_required", processingStatus }] }, [first]), [first]);
  }
});

test("runner finalization makes review-required results checkpoint-completable without confirming evidence", async () => {
  const dir = await scratch();
  const tracePath = path.join(dir, "trace.json");
  const trace = { items: [{ source: { sha256: first.sourceSha256 }, candidates: [{ needsReview: true, isConfirmed: false }] }] };
  await fs.writeFile(tracePath, JSON.stringify(trace), { flag: "wx" });
  const result = {
    ...first, buildId: options.buildId, processingVersion: options.processingVersion,
    status: "review_required", processingStatus: "not_run", tracePath,
    startedAt: new Date().toISOString(), completedAt: null,
    steps: [{ name: "upload-and-process", ok: true }], consoleErrors: [], pageErrors: [],
    assertions: { fieldAudit: { passed: true }, reviewDerivedPreviewVisible: true, needsReview: 1 },
  };
  contract.finalizeBatchResult(result);
  assert.equal(result.processingStatus, "completed");
  assert.equal(result.status, "review_required");
  assert.ok(Date.parse(result.completedAt) >= Date.parse(result.startedAt));
  const checkpointPath = path.join(dir, "checkpoint.json");
  await writeAtomicJson(checkpointPath, checkpointFor(manifest(), [result]));
  const checkpoint = await readCheckpoint(checkpointPath);
  assert.equal(isCheckpointCompatible(checkpoint, manifest()).compatible, true);
  assert.deepEqual(getPendingFixtures(checkpoint, [first, second]), [second]);
  assert.equal(checkpoint.results[0].status, "review_required");
  assert.equal(await fs.readFile(tracePath, "utf8"), JSON.stringify(trace));
  assert.equal(trace.items[0].candidates[0].needsReview, true);
  assert.equal(trace.items[0].candidates[0].isConfirmed, false);
});

test("runner finalization never marks failed gates or processing errors completed", () => {
  const successful = { status: "review_required", pageErrors: [], assertions: { fieldAudit: { passed: true }, reviewDerivedPreviewVisible: true } };
  for (const overrides of [
    { error: "processing failed" }, { externalProviderCall: "/api/slips/extract" },
    { pageErrors: ["page failed"] }, { assertions: { fieldAudit: { passed: false }, reviewDerivedPreviewVisible: true } },
    { assertions: { fieldAudit: { passed: true }, reviewDerivedPreviewVisible: false } },
  ]) {
    const result = structuredClone({ ...successful, ...overrides });
    contract.finalizeBatchResult(result);
    assert.equal(result.processingStatus, "failed");
    assert.equal(result.status, "failed");
  }
  const optionalPreview = { ...successful, assertions: { fieldAudit: { passed: true }, reviewDerivedPreviewVisible: false } };
  contract.finalizeBatchResult(optionalPreview, { requireReviewDerivedPreview: false });
  assert.equal(optionalPreview.processingStatus, "completed");
  assert.equal(optionalPreview.status, "review_required");
});

test("runner preserves a diagnostic no-candidate outcome as review_required", () => {
  const result = {
    status: "review_required", tracePath: "C:/evidence/trace.json", pageErrors: [],
    assertions: { traceCandidates: 0, fieldAudit: { passed: false }, reviewDerivedPreviewVisible: true },
  };
  contract.finalizeBatchResult(result);
  assert.equal(result.processingStatus, "completed");
  assert.equal(result.status, "review_required");
});
