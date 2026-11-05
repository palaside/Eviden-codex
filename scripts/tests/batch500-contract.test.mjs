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

const sha = (value) => createHash("sha256").update(value).digest("hex");
const first = { fixturePath: "/fixtures/first.png", sourceSha256: sha("first"), size: 5 };
const second = { fixturePath: "/fixtures/second.png", sourceSha256: sha("second"), size: 6 };
const options = { runId: "run-one", buildId: "build-one", gitCommit: "commit-one", processingVersion: "local-v1", inventory: [first, second], batches: [{ batchId: "001", offset: 0, limit: 2 }] };
const manifest = () => createBatchRunManifest(options);
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
  assert.deepEqual(isCheckpointCompatible({ ...run, runId: "resume", results: [] }, run), { compatible: true, reasons: [] });
});

test("incompatible build, commit, processing version, inventory and batch layout are explained", () => {
  const run = manifest();
  for (const [field, replacement] of Object.entries({ buildId: "other", gitCommit: "other", processingVersion: "other", inventory: [first], batches: [] })) {
    const result = isCheckpointCompatible({ ...run, [field]: replacement }, run);
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
  const completed = { ...first, status: "completed", tracePath };
  assert.deepEqual(getPendingFixtures({ results: [completed] }, [first, second]), [second]);
  for (const status of ["failed", "not_run", "skipped_duplicate", "review_required"]) {
    assert.deepEqual(getPendingFixtures({ results: [{ ...completed, status }] }, [first]), [first]);
  }
  for (const record of [{ ...completed, tracePath: "missing-trace.json" }, { ...completed, sourceSha256: second.sourceSha256 }]) {
    assert.deepEqual(getPendingFixtures({ results: [record] }, [first, second]), [first, second]);
  }
  const corruptPath = path.join(dir, "corrupt.json");
  await fs.writeFile(corruptPath, "{broken", { flag: "wx" });
  assert.deepEqual(getPendingFixtures({ results: [{ ...completed, tracePath: corruptPath }] }, [first]), [first]);
});
