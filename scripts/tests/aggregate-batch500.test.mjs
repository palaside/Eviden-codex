import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { aggregateBatchReports, validateTraceEvidence } from '../aggregate-batch500.mjs';

const sha = value => createHash('sha256').update(String(value)).digest('hex');
const stamp = '2026-11-05T12:00:00.000Z';
const trace = sourceSha256 => ({ items: [{ source: { sha256: sourceSha256 }, candidates: [{
  source: { sha256: sourceSha256 }, needsReview: false,
  fieldCrops: [{ field: 'amount', cropSha256: sha('crop'), bounds: { x: 0, y: 0, width: 2, height: 3 }, rawOcr: '', confidence: 0 }],
}] }] });

async function fixture(count = 500) {
  // Retain all test evidence: no fixture or report cleanup/deletion.
  const runDir = await fs.mkdtemp(path.resolve('For Test Results/task3-test-'));
  const inventory = Array.from({ length: count }, (_, i) => ({ fixturePath: path.join(runDir, `source-${i}.png`), sourceSha256: sha(i) }));
  const batches = [{ batchId: '001', offset: 0, limit: 10 }, { batchId: '002', offset: 10, limit: 490 }];
  const manifest = { inventory, batches, buildId: 'test-build', processingVersion: 'test-v1', gitCommit: 'test-commit', runIdentity: sha('run') };
  const results = [];
  for (const [i, item] of inventory.entries()) {
    const tracePath = path.join(runDir, `${i}-trace.json`);
    await fs.writeFile(tracePath, JSON.stringify(trace(item.sourceSha256)), { flag: 'wx' });
    results.push({ ...item, batchId: i < 10 ? '001' : '002', tracePath, status: 'completed', processingStatus: 'completed',
      buildId: manifest.buildId, processingVersion: manifest.processingVersion, startedAt: stamp, completedAt: stamp });
  }
  const checkpoint = { ...manifest, results, updatedAt: stamp };
  const expectedInventoryPath = path.join(runDir, 'manifest.json');
  await fs.writeFile(expectedInventoryPath, JSON.stringify(manifest), { flag: 'wx' });
  const save = () => fs.writeFile(path.join(runDir, 'checkpoint.json'), JSON.stringify(checkpoint));
  await save();
  return { runDir, expectedInventoryPath, checkpoint, inventory, save };
}
const aggregate = f => aggregateBatchReports({ runDir: f.runDir, expectedInventoryPath: f.expectedInventoryPath });

test('complete 500 records produce four linked outputs without overwriting prior evidence', async () => {
  const f = await fixture();
  const before = await fs.readFile(path.join(f.runDir, 'checkpoint.json'), 'utf8');
  const report = await aggregate(f);
  assert.equal(report.status, 'passed');
  assert.equal(report.counts.completed, 500);
  assert.equal(report.records.length, 500);
  for (const name of ['aggregate-report.json', 'missing.json', 'duplicates.json', 'trace-integrity.json']) {
    const output = JSON.parse(await fs.readFile(path.join(report.outputDir, name), 'utf8'));
    assert.equal(output.records.length, 500);
    for (const key of ['fixturePath', 'sourceSha256', 'batchId', 'tracePath', 'buildId', 'processingVersion', 'startedAt', 'completedAt', 'aggregatedAt']) assert.ok(key in output.records[0], key);
  }
  const second = await aggregate(f);
  assert.notEqual(second.outputDir, report.outputDir);
  assert.equal(await fs.readFile(path.join(f.runDir, 'checkpoint.json'), 'utf8'), before);
});

test('missing range remains not_run with contiguous inventory indices', async () => {
  const f = await fixture(); f.checkpoint.results.splice(10); await f.save();
  const r = await aggregate(f);
  assert.equal(r.status, 'incomplete'); assert.equal(r.counts.not_run, 490);
  assert.deepEqual(r.missingRanges, [{ startIndex: 10, endIndex: 499, count: 490 }]);
});

test('a ten-record inventory can never be a full pass', async () => {
  const r = await aggregate(await fixture(10));
  assert.equal(r.status, 'incomplete'); assert.equal(r.inventoryCount, 10);
  assert.ok(r.issues.some(x => x.includes('500')));
});

test('duplicate SHA keeps both paths and distinguishes skipped occurrence from repeated processing', async () => {
  const f = await fixture(10);
  f.inventory[1].sourceSha256 = f.inventory[0].sourceSha256;
  Object.assign(f.checkpoint.results[1], { sourceSha256: f.inventory[0].sourceSha256, status: 'skipped_duplicate', processingStatus: 'skipped_duplicate', tracePath: f.checkpoint.results[0].tracePath, duplicateOf: f.inventory[0].fixturePath });
  await fs.writeFile(f.expectedInventoryPath, JSON.stringify(f.checkpoint)); await f.save();
  let r = await aggregate(f);
  assert.equal(r.duplicateSources.length, 1); assert.equal(r.duplicateSources[0].occurrences.length, 2);
  assert.equal(r.duplicateProcessing.length, 0); assert.equal(r.counts.skipped_duplicate, 1);
  Object.assign(f.checkpoint.results[1], { status: 'completed', processingStatus: 'completed' }); await f.save();
  r = await aggregate(f); assert.equal(r.duplicateProcessing.length, 1);
});

test('unparseable, empty and SHA-mismatched traces are reported without losing review_required', async () => {
  const f = await fixture(10);
  f.checkpoint.results[0].status = 'review_required';
  await fs.writeFile(f.checkpoint.results[0].tracePath, '{bad');
  await fs.writeFile(f.checkpoint.results[1].tracePath, '{}');
  await fs.writeFile(f.checkpoint.results[2].tracePath, JSON.stringify(trace(sha('wrong')))); await f.save();
  const r = await aggregate(f);
  assert.equal(r.records[0].status, 'review_required');
  assert.equal(r.records[1].status, 'failed');
  assert.equal(r.traceIntegrity.filter(x => !x.valid).length, 3);
});

test('trace requires candidate SHA and every crop evidence component with strict numeric validation', () => {
  assert.equal(validateTraceEvidence(trace(sha(0))).valid, true);
  for (const key of ['cropSha256', 'bounds', 'rawOcr', 'confidence']) {
    const t = trace(sha(0)); delete t.items[0].candidates[0].fieldCrops[0][key];
    const r = validateTraceEvidence(t); assert.equal(r.valid, false); assert.ok(r.missing.some(x => x.includes(key)));
  }
  for (const value of [null, '', '0.5', Infinity, -1, 2]) {
    const t = trace(sha(0)); t.items[0].candidates[0].fieldCrops[0].confidence = value;
    assert.equal(validateTraceEvidence(t).valid, false);
  }
  const t = trace(sha(0)); delete t.items[0].candidates[0].source;
  assert.ok(validateTraceEvidence(t).missing.some(x => x.includes('sourceSha256')));
  assert.equal(validateTraceEvidence({ items: [] }).valid, false);
  t.items[0].candidates[0].fieldCrops = [];
  assert.equal(validateTraceEvidence(t).valid, false);
});

test('review_required is preserved from checkpoint, separate reviewStatus and trace', async () => {
  const f = await fixture(10);
  f.checkpoint.results[0].status = 'review_required';
  f.checkpoint.results[1].reviewStatus = 'review_required';
  const t = trace(f.inventory[2].sourceSha256); t.items[0].candidates[0].needsReview = true;
  await fs.writeFile(f.checkpoint.results[2].tracePath, JSON.stringify(t)); await f.save();
  const r = await aggregate(f); assert.equal(r.counts.review_required, 3);
  assert.ok(r.records.slice(0, 3).every(x => x.status === 'review_required'));
});

test('duplicate attempts and unexpected results are detected, mirrored report snapshots are not attempts', async () => {
  const f = await fixture(10);
  const outDir = path.join(f.runDir, 'batch-001'); await fs.mkdir(outDir);
  f.checkpoint.batchStates = { '001': { outDir } };
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify({ results: [f.checkpoint.results[0]] }));
  await f.save(); assert.equal((await aggregate(f)).duplicateProcessing.length, 0);
  f.checkpoint.results.push({ ...f.checkpoint.results[0], tracePath: f.checkpoint.results[1].tracePath });
  f.checkpoint.results.push({ ...f.checkpoint.results[0], fixturePath: 'unexpected.png' }); await f.save();
  const r = await aggregate(f);
  assert.equal(r.duplicateProcessing.length, 1); assert.equal(r.unexpectedResults.length, 1);
});

test('missing provenance and unsupported result states cannot produce a full pass', async () => {
  const f = await fixture();
  f.checkpoint.results[0].buildId = 'other-build';
  delete f.checkpoint.results[1].completedAt;
  f.checkpoint.results[2].status = 'confirmed'; await f.save();
  const r = await aggregate(f); assert.notEqual(r.status, 'passed');
  assert.ok(r.traceIntegrity[0].missing.includes('buildId mismatch'));
  assert.ok(r.traceIntegrity[1].missing.includes('completedAt'));
  assert.equal(r.records[2].status, 'failed');
});

test('malformed nested trace objects are integrity failures rather than aggregator crashes', async () => {
  const f = await fixture(10);
  await fs.writeFile(f.checkpoint.results[0].tracePath, JSON.stringify({ items: [null] }));
  await fs.writeFile(f.checkpoint.results[1].tracePath, JSON.stringify({ items: [{ source: { sha256: f.inventory[1].sourceSha256 }, candidates: [null] }] }));
  const r = await aggregate(f);
  assert.equal(r.traceIntegrity[0].valid, false); assert.equal(r.traceIntegrity[1].valid, false);
});

test('conflicting mirrored provenance is not silently accepted', async () => {
  const f = await fixture();
  const outDir = path.join(f.runDir, 'batch-001'); await fs.mkdir(outDir);
  f.checkpoint.batchStates = { '001': { outDir } };
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify({ results: [{ ...f.checkpoint.results[0], buildId: 'other-build' }] }));
  await f.save(); const r = await aggregate(f);
  assert.equal(r.status, 'failed'); assert.ok(r.issues.some(x => x.includes('conflicting mirrored buildId')));
});

test('earlier batch attempt reports remain visible even when checkpoint no longer references them', async () => {
  const f = await fixture(10);
  const outDir = path.join(f.runDir, 'batch-001-earlier-attempt'); await fs.mkdir(outDir);
  const earlier = { ...f.checkpoint.results[0], startedAt: '2026-11-05T11:00:00.000Z' };
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify({ results: [earlier] }));
  const r = await aggregate(f);
  assert.equal(r.duplicateProcessing.length, 1);
  assert.equal(r.records[0].attemptCount, 2);
});
