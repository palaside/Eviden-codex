import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createBatchRunManifest, writeAtomicJson } from '../batch500-contract.mjs';
import { DEFAULT_BATCH_SPEC, parseBatchSpec, buildInventory, runBatch } from '../run-batch500-resumable.mjs';

// Retain test evidence; never remove fixtures or previous run directories.
async function setup(count = 3) {
  const evidenceRoot = path.resolve('For Test Results/task2-unit');
  await fs.mkdir(evidenceRoot, { recursive: true });
  const dir = await fs.mkdtemp(path.join(evidenceRoot, 'batch500-task2-'));
  const inventory = [];
  for (let i = 0; i < count; i++) {
    const fixturePath = path.join(dir, `${i}.png`);
    await fs.writeFile(fixturePath, `image-${i}`);
    inventory.push({ fixturePath, sourceSha256: createHash('sha256').update(`image-${i}`).digest('hex'), size: 7, modifiedTime: (await fs.stat(fixturePath)).mtime.toISOString() });
  }
  const manifest = createBatchRunManifest({ runId: 'test', buildId: 'build', gitCommit: 'commit', processingVersion: 'batch-local-e2e.v1', inventory, batches: [{ batchId: '001', offset: 0, limit: count }] });
  const manifestPath = path.join(dir, 'manifest.json');
  await writeAtomicJson(manifestPath, manifest);
  return { dir, inventory, manifestPath };
}
async function completed(item, outDir) {
  const tracePath = path.join(outDir, `${item.sourceSha256}.json`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(tracePath, JSON.stringify({ items: [{ source: { sha256: item.sourceSha256 } }] }));
  return { ...item, tracePath, buildId: 'build', processingVersion: 'batch-local-e2e.v1', processingStatus: 'completed', status: 'review_required' };
}

test('exact seven ranges cover 500 positions with no overlap or gap', () => {
  assert.equal(DEFAULT_BATCH_SPEC, '001:0:10,002:10:50,003:60:100,004:160:100,005:260:100,006:360:100,007:460:40');
  const ranges = parseBatchSpec();
  assert.deepEqual(ranges.map(r => r.limit), [10, 50, 100, 100, 100, 100, 40]);
  assert.deepEqual(ranges.flatMap(r => Array.from({ length: r.limit }, (_, i) => r.offset + i)), Array.from({ length: 500 }, (_, i) => i));
  for (const spec of ['001:0:10,002:9:491', '001:1:499', '001:0:499', '001:0:250,001:250:250']) assert.throws(() => parseBatchSpec(spec));
});
test('inventory is deterministic, absolute, hashed, capped at 500 and rejects fewer', async () => {
  const { dir } = await setup(2);
  await assert.rejects(buildInventory([dir]), /exactly 500/);
  for (let i = 2; i < 500; i++) await fs.writeFile(path.join(dir, `${i}.png`), `image-${i}`);
  const items = await buildInventory([dir]);
  assert.equal(items.length, 500);
  assert.deepEqual(items, await buildInventory([dir]));
  assert.ok(items.every(i => path.isAbsolute(i.fixturePath) && i.size > 0 && i.modifiedTime && /^[a-f0-9]{64}$/.test(i.sourceSha256)));
  await fs.writeFile(path.join(dir, 'zzz-extra.png'), 'extra');
  assert.deepEqual(items, await buildInventory([dir]));
});
test('resume skips proven completed SHA, preserves review_required and launches once', async () => {
  const { manifestPath } = await setup();
  const seen = [];
  const runner = async ({ fixtures, outDir, onResult }) => {
    for (const item of fixtures) { seen.push(item.sourceSha256); await onResult(await completed(item, outDir)); }
  };
  const first = await runBatch({ manifestPath, batchId: '001', offset: 0, limit: 3, runner });
  const resumed = await runBatch({ manifestPath, batchId: '001', offset: 0, limit: 3, runner: () => assert.fail('must not resend') });
  assert.equal(seen.length, 3);
  assert.equal(new Set(seen).size, 3);
  assert.equal(first.results.length, 3);
  assert.ok(resumed.results.every(r => r.status === 'review_required'));
});
test('checkpoint is durable per image and retains failure after runner throws', async () => {
  const { manifestPath, dir } = await setup();
  await assert.rejects(runBatch({ manifestPath, batchId: '001', offset: 0, limit: 3, runner: async ({ fixtures, outDir, onResult }) => {
    await onResult(await completed(fixtures[0], outDir));
    const checkpoint = JSON.parse(await fs.readFile(path.join(dir, 'checkpoint.json')));
    assert.equal(checkpoint.results[0].processingStatus, 'completed');
    throw new Error('simulated runner failure');
  } }), /simulated runner failure/);
  const checkpoint = JSON.parse(await fs.readFile(path.join(dir, 'checkpoint.json')));
  assert.equal(checkpoint.results[0].processingStatus, 'completed');
  assert.match(checkpoint.batchStates['001'].error, /simulated runner failure/);
  assert.equal(checkpoint.batchStates['001'].status, 'failed');
});
test('invalid trace is pending and incompatible checkpoint fails closed', async () => {
  const { manifestPath, dir } = await setup(1);
  const args = { manifestPath, batchId: '001', offset: 0, limit: 1 };
  const first = await runBatch({ ...args, runner: async ({ fixtures, outDir, onResult }) => onResult(await completed(fixtures[0], outDir)) });
  await fs.writeFile(first.results[0].tracePath, '{broken');
  let calls = 0;
  await runBatch({ ...args, runner: async ({ fixtures, outDir, onResult }) => { calls++; await onResult(await completed(fixtures[0], outDir)); } });
  assert.equal(calls, 1);
  const checkpointPath = path.join(dir, 'checkpoint.json');
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath));
  checkpoint.buildId = 'other';
  await writeAtomicJson(checkpointPath, checkpoint);
  await assert.rejects(runBatch({ ...args, runner: () => assert.fail() }), /buildId/);
});
test('provider/quota error stops before next image and blocks automatic resume', async () => {
  const { manifestPath, dir } = await setup();
  let sent = 0;
  const args = { manifestPath, batchId: '001', offset: 0, limit: 3 };
  await assert.rejects(runBatch({ ...args, runner: async ({ fixtures, onResult }) => {
    for (const item of fixtures) { sent++; await onResult({ ...item, status: 'failed', processingStatus: 'failed', error: 'quota exceeded HTTP 429' }); }
  } }), /quota|provider/i);
  assert.equal(sent, 1);
  assert.ok(JSON.parse(await fs.readFile(path.join(dir, 'checkpoint.json'))).stopReason);
  await assert.rejects(runBatch({ ...args, runner: () => assert.fail() }), /quota|provider/i);
});
test('browser integration awaits result hook before next image (required stop/checkpoint contract)', async () => {
  const source = await fs.readFile(new URL('../e2e-batch-local.mjs', import.meta.url), 'utf8');
  assert.ok(/await globalThis\[Symbol\.for\("digital-evidence\.batch-result"\)\]\?\.\(result\)/.test(source), 'missing awaited checkpoint/stop barrier');
});
test('source changed after completion cannot be skipped even through runBatch API', async () => {
  const { manifestPath, inventory } = await setup(1);
  const args = { manifestPath, batchId: '001', offset: 0, limit: 1 };
  await runBatch({ ...args, runner: async ({ fixtures, outDir, onResult }) => onResult(await completed(fixtures[0], outDir)) });
  await fs.writeFile(inventory[0].fixturePath, 'changed source');
  await assert.rejects(runBatch({ ...args, runner: () => assert.fail() }), /Source SHA changed/);
});
test('duplicate occurrences are accountable while the SHA is processed only once', async () => {
  const { manifestPath, inventory } = await setup(2);
  await fs.writeFile(inventory[1].fixturePath, 'image-0');
  const manifest = JSON.parse(await fs.readFile(manifestPath));
  manifest.inventory[1].sourceSha256 = inventory[0].sourceSha256;
  await writeAtomicJson(manifestPath, createBatchRunManifest(manifest));
  let count = 0;
  const result = await runBatch({ manifestPath, batchId: '001', offset: 0, limit: 2, runner: async ({ fixtures, outDir, onResult }) => {
    count = fixtures.length;
    for (const item of fixtures) await onResult(await completed(item, outDir));
  } });
  assert.equal(count, 1);
  assert.equal(result.results.length, 2);
  assert.equal(result.results.find(r => r.status === 'skipped_duplicate').reviewStatus, 'review_required');
});
