import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, fork } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createBatchRunManifest, writeAtomicJson, readCheckpoint, isCheckpointCompatible, getPendingFixtures } from './batch500-contract.mjs';

export const DEFAULT_BATCH_SPEC = '001:0:10,002:10:50,003:60:100,004:160:100,005:260:100,006:360:100,007:460:40';
export const REPRESENTATIVE_100_BATCH_SPEC = '001:0:10,002:10:50,003:60:40';
const DEFAULT_ROOTS = 'For Test/แชทที่ 1;For Test/แชทที่ 2;For Test/แชทที่ 3;For Test/Done';
const PROCESSING_VERSION = 'batch-local-e2e.v1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function parseBatchSpec(spec = DEFAULT_BATCH_SPEC, expectedTotal = 500) {
  let end = 0;
  const ids = new Set();
  const batches = spec.split(',').map(part => {
    if (!/^\d{3}:\d+:\d+$/.test(part)) throw new Error(`Invalid batch range: ${part}`);
    const [batchId, start, count] = part.split(':');
    const offset = Number(start), limit = Number(count);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || limit <= 0 || offset !== end || ids.has(batchId)) throw new Error('Batch overlap, gap, duplicate ID or invalid range');
    ids.add(batchId);
    end = offset + limit;
    return { batchId, offset, limit };
  });
  if (end !== expectedTotal) throw new Error(`Batch layout must cover exactly ${expectedTotal} images`);
  return batches;
}

export async function buildInventory(roots, expectedTotal = 500) {
  const paths = new Set();
  // Match the existing runner: approved roots, direct image files only.
  for (const root of roots) {
    const absolute = await fs.realpath(path.resolve(root));
    for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
      if (entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name)) paths.add(await fs.realpath(path.join(absolute, entry.name)));
    }
  }
  if (paths.size < expectedTotal) throw new Error(`Require at least ${expectedTotal} image records; found only ${paths.size}`);
  const inventory = [];
  for (const fixturePath of [...paths].sort(compare).slice(0, expectedTotal)) {
    const stat = await fs.stat(fixturePath);
    inventory.push({ fixturePath, size: stat.size, modifiedTime: stat.mtime.toISOString(), sourceSha256: sha(await fs.readFile(fixturePath)) });
  }
  return inventory;
}

function providerError(result) {
  return Boolean(result.externalProviderCall
    || result.apiResponses?.some(r => r.status === 429 || r.status === 402)
    || /quota|rate.?limit|resource.?exhausted|provider|\b429\b|\b402\b/i.test(result.error || ''));
}

export async function runBatch({ manifestPath, batchId, offset, limit, runner }) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const runDir = path.dirname(path.resolve(manifestPath));
  const checkpointPath = path.join(runDir, 'checkpoint.json');
  const range = manifest.batches.find(b => b.batchId === batchId);
  if (!range || range.offset !== offset || range.limit !== limit) throw new Error('Batch layout mismatch');
  let checkpoint = await readCheckpoint(checkpointPath);
  if (!checkpoint) checkpoint = { ...manifest, schema: 'digital-evidence.batch500-checkpoint.v1', results: [], batchStates: {} };
  const compatibility = isCheckpointCompatible(checkpoint, manifest);
  if (!compatibility.compatible) throw new Error(compatibility.reasons.join('; '));
  if (checkpoint.stopReason) throw new Error(`Run stopped: ${checkpoint.stopReason}; no automatic retry`);
  const persist = async () => { checkpoint.updatedAt = new Date().toISOString(); await writeAtomicJson(checkpointPath, checkpoint); };
  const selected = manifest.inventory.slice(offset, offset + limit);
  // Validate even completed inputs before deciding to skip them.
  for (const item of selected) {
    if (sha(await fs.readFile(item.fixturePath)) !== item.sourceSha256) throw new Error(`Source SHA changed: ${item.fixturePath}`);
  }
  const accountOccurrences = () => {
    for (const item of selected) {
      const index = checkpoint.results.findIndex(r => r.fixturePath === item.fixturePath);
      const existing = checkpoint.results[index];
      if (existing && getPendingFixtures({ results: [existing] }, [item]).length === 0) continue;
      const original = checkpoint.results.find(r => r.sourceSha256 === item.sourceSha256 && getPendingFixtures({ results: [r] }, [item]).length === 0);
      let record;
      if (original) {
        const reviewStatus = [existing?.reviewStatus, existing?.status, original.reviewStatus, original.status].includes('review_required') ? 'review_required' : original.status;
        record = { ...item, batchId, status: 'skipped_duplicate', processingStatus: 'skipped_duplicate', duplicateOf: original.fixturePath, tracePath: original.tracePath, reviewStatus, buildId: manifest.buildId, processingVersion: manifest.processingVersion };
      } else {
        record = existing ? { ...existing } : { ...item, batchId, status: 'not_run', processingStatus: 'not_run' };
        // A SHA relationship is not proof of processing completion. Retain
        // pending/failed occurrences until a valid completed trace is available.
        if (record.status === 'skipped_duplicate') record.status = record.processingStatus = 'not_run';
        const representative = selected.find(i => i.sourceSha256 === item.sourceSha256);
        if (representative.fixturePath !== item.fixturePath) record.duplicateOf = representative.fixturePath;
        else delete record.duplicateOf;
      }
      if (index < 0) checkpoint.results.push(record);
      else checkpoint.results[index] = record;
    }
  };
  // Account per path before SHA-deduplicating work, including early failures.
  accountOccurrences();
  const pending = getPendingFixtures(checkpoint, selected);
  if (!pending.length) {
    checkpoint.batchStates[batchId] = { ...checkpoint.batchStates[batchId], status: 'completed', completedAt: new Date().toISOString() };
    await persist();
    return checkpoint;
  }
  const outDir = path.join(runDir, `batch-${batchId}-${randomUUID()}`);
  const seen = new Set();
  checkpoint.batchStates[batchId] = { status: 'running', outDir, startedAt: new Date().toISOString() };
  await persist();
  try {
    await runner({ fixtures: pending, outDir, batchId, offset, limit, manifest, onResult: async result => {
      const item = pending.find(i => i.sourceSha256 === result.sourceSha256 && i.fixturePath === result.fixturePath);
      if (!item || seen.has(result.sourceSha256)) throw new Error('Unexpected or duplicate runner result');
      if (result.buildId !== manifest.buildId || result.processingVersion !== manifest.processingVersion) {
        // Missing metadata on a failed provider response must still be retained.
        if (!providerError(result)) throw new Error('Runner build/processing identity mismatch');
      }
      seen.add(result.sourceSha256);
      const record = { ...result, batchId, outDir };
      checkpoint.results = checkpoint.results.map(r => r.fixturePath === item.fixturePath ? record : r);
      accountOccurrences();
      if (providerError(result)) checkpoint.stopReason = `provider/quota error: ${result.error || result.externalProviderCall || 'HTTP quota response'}`;
      await persist();
      if (checkpoint.stopReason) throw new Error(checkpoint.stopReason);
    } });
    if (seen.size !== pending.length) throw new Error(`Runner incomplete: ${seen.size}/${pending.length} results`);
    const incomplete = getPendingFixtures(checkpoint, selected);
    if (incomplete.length) throw new Error(`${incomplete.length} images lack processing-complete SHA-matching traces`);
    checkpoint.batchStates[batchId].status = 'completed';
  } catch (error) {
    checkpoint.batchStates[batchId].status = 'failed';
    checkpoint.batchStates[batchId].error = error.stack || String(error);
    if (providerError({ error: String(error) })) checkpoint.stopReason ||= String(error);
    accountOccurrences();
    await persist();
    throw error;
  } finally {
    checkpoint.batchStates[batchId].completedAt = new Date().toISOString();
    await persist();
  }
  return checkpoint;
}

// IPC acknowledgement forms a strict per-image barrier. The original browser
// runner cannot upload the next image until its checkpoint is durable.
export function browserRunner({ baseUrl, fixtureRoots, buildDir, manifest }) {
  return ({ fixtures, outDir, offset, limit, onResult }) => new Promise((resolve, reject) => {
    const child = fork(new URL(import.meta.url), ['--browser-worker'], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, E2E_BASE_URL: baseUrl, E2E_FIXTURE_ROOTS: fixtureRoots.join(';'), E2E_FIXTURE_FILES: fixtures.map(i => i.fixturePath).join(';'), E2E_BUILD_DIR: buildDir, E2E_BUILD_ID: manifest.buildId, E2E_PROCESSING_VERSION: manifest.processingVersion, E2E_OUT_DIR: outDir, E2E_BATCH_OFFSET: String(offset), E2E_BATCH_LIMIT: String(limit) },
    });
    let failure;
    child.on('message', async message => {
      if (message.type !== 'result') return;
      try { await onResult(message.result); child.send({ type: 'ack' }); }
      catch (error) { failure = error; child.send({ type: 'stop', error: error.message }); }
    });
    child.on('error', reject);
    child.on('exit', code => failure ? reject(failure) : code === 0 ? resolve() : reject(new Error(`Browser runner exited ${code}; partial evidence retained at ${outDir}`)));
  });
}

export async function checkRuntime(baseUrl, buildDir, expectedBuild) {
  const buildId = (await fs.readFile(path.join(buildDir, 'BUILD_ID'), 'utf8')).trim();
  if (expectedBuild && buildId !== expectedBuild) throw new Error('Local build ID mismatch');
  const response = await fetch(baseUrl, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}; require 200`);
  const html = (await response.text()).replaceAll('\\"', '"');
  const rendered = [...html.matchAll(/"b":"([^"]+)"/g)].map(match => match[1]);
  if (!rendered.includes(buildId)) throw new Error(`HTTP build ID mismatch or unavailable; expected ${buildId}`);
  return buildId;
}

async function main() {
  const { values } = parseArgs({ options: {
    'base-url': { type: 'string', default: 'http://127.0.0.1:3450/' },
    'fixture-roots': { type: 'string', default: DEFAULT_ROOTS },
    'out-dir': { type: 'string' }, 'build-dir': { type: 'string', default: 'build-output-enterprise' },
    'batch-spec': { type: 'string' }, 'inventory-limit': { type: 'string', default: '500' }, resume: { type: 'boolean', default: false },
    'batch-id': { type: 'string' },
  } });
  const inventoryLimit = Number(values['inventory-limit']);
  if (!Number.isSafeInteger(inventoryLimit) || inventoryLimit <= 0) throw new Error('inventory-limit must be a positive integer');
  const roots = values['fixture-roots'].split(';').filter(Boolean).map(p => path.resolve(p));
  const buildDir = path.resolve(values['build-dir']);
  const batchSpec = values['batch-spec'] || (inventoryLimit === 100 ? REPRESENTATIVE_100_BATCH_SPEC : DEFAULT_BATCH_SPEC);
  const batches = parseBatchSpec(batchSpec, inventoryLimit);
  const selected = values['batch-id'] ? batches.filter(b => b.batchId === values['batch-id']) : batches;
  if (!selected.length) throw new Error('Unknown batch ID');
  const inventory = await buildInventory(roots, inventoryLimit);
  const buildId = await checkRuntime(values['base-url'], buildDir);
  const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (values.resume && !values['out-dir']) throw new Error('--resume requires --out-dir');
  const runDir = path.resolve(values['out-dir'] || path.join('For Test Results', `batch${inventoryLimit}-resumable-${randomUUID()}`));
  const manifestPath = path.join(runDir, 'manifest.json');
  let manifest = createBatchRunManifest({ runId: path.basename(runDir), buildId, gitCommit, processingVersion: PROCESSING_VERSION, inventory, batches });
  if (values.resume) {
    const previous = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (previous.runIdentity !== manifest.runIdentity) throw new Error('Resume identity mismatch: build/git/processing/inventory/batch layout');
    manifest = previous;
  } else {
    await fs.mkdir(path.dirname(runDir), { recursive: true });
    await fs.mkdir(runDir); // Fail if any older run directory exists.
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  }
  for (const batch of selected) {
    await checkRuntime(values['base-url'], buildDir, manifest.buildId);
    if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== manifest.gitCommit) throw new Error('Git commit changed');
    const checkpoint = await runBatch({ manifestPath, ...batch, runner: browserRunner({ baseUrl: values['base-url'], fixtureRoots: roots, buildDir, manifest }) });
    console.log(JSON.stringify({ runDir, batchId: batch.batchId, status: checkpoint.batchStates[batch.batchId].status, results: checkpoint.results.length }));
  }
}

if (process.argv[2] === '--browser-worker') {
  globalThis[Symbol.for('digital-evidence.batch-result')] = result => new Promise((resolve, reject) => {
    process.once('message', message => message.type === 'ack' ? resolve() : reject(new Error(message.error || 'Parent stopped batch')));
    process.send({ type: 'result', result });
  });
  process.on('disconnect', () => process.exit(1));
  try { await import('./e2e-batch-local.mjs'); process.exit(process.exitCode || 0); }
  catch (error) { console.error(error); process.exit(1); }
} else if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}
