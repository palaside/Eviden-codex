import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const SHA256 = /^[a-f0-9]{64}$/i;
const STATUSES = ['completed', 'review_required', 'failed', 'skipped_duplicate', 'not_run'];
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const sourceSha = candidate => candidate?.sourceSha256 || candidate?.source?.sha256;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validBounds = bounds => object(bounds) && ['x', 'y', 'width', 'height'].every(k => typeof bounds[k] === 'number' && Number.isFinite(bounds[k]))
  && bounds.x >= 0 && bounds.y >= 0 && bounds.width > 0 && bounds.height > 0;
const needsReview = candidate => candidate?.needsReview === true || candidate?.reviewStatus === 'review_required'
  || candidate?.status === 'review_required' || candidate?.data?._fallback_meta?.needs_human_review === true
  || Object.values(candidate?.fieldQualitySummary || {}).includes('review_required')
  || (Array.isArray(candidate?.fieldCrops) && candidate.fieldCrops.some(field => field?.review_status === 'review_required' || field?.certification_status === 'review_required'));
const traceNeedsReview = trace => Array.isArray(trace?.items) && trace.items.some(item => needsReview(item)
  || (Array.isArray(item?.candidates) && item.candidates.some(needsReview)));

// The existing extraction trace contract puts crop hashes and field-level OCR
// evidence in items[].candidates[].fieldCrops (not the advisory fieldEvidence map).
export function validateTraceEvidence(trace) {
  const missing = [];
  if (!Array.isArray(trace?.items) || !trace.items.length) return { valid: false, missing: ['items: empty or missing'] };
  trace.items.forEach((item, i) => {
    const prefix = `items[${i}]`;
    if (!SHA256.test(sourceSha(item) || '')) missing.push(`${prefix}.sourceSha256`);
    if (!Array.isArray(item?.candidates) || !item.candidates.length) {
      // No candidate is an explicit review outcome, not a false assertion that
      // a slip was detected. A trace with diagnostics/warnings is therefore
      // valid evidence for review_required, while a silent empty trace is not.
      const hasDiagnostic = Number(item?.diagnosticCounts?.ocrAttempts || 0) > 0
        || Array.isArray(item?.ocrDiagnosticTrace?.attempts);
      const requiresReview = Array.isArray(item?.warnings)
        && item.warnings.some((warning) => /candidate|ตรวจภาพ|QR\/OCR/u.test(String(warning)));
      if (!hasDiagnostic || !requiresReview) missing.push(`${prefix}.candidates: empty without diagnostic review evidence`);
      return;
    }
    item.candidates.forEach((candidate, j) => {
      const location = `${prefix}.candidates[${j}]`;
      if (!SHA256.test(sourceSha(candidate) || '')) missing.push(`${location}.sourceSha256`);
      else if (sourceSha(candidate) !== sourceSha(item)) missing.push(`${location}.sourceSha256 mismatch`);
      if (!Array.isArray(candidate?.fieldCrops) || !candidate.fieldCrops.length) {
        missing.push(`${location}.fieldCrops: empty or missing`); return;
      }
      candidate.fieldCrops.forEach((field, k) => {
        const fieldPath = `${location}.fieldCrops[${k}]`;
        if (!SHA256.test(field?.cropSha256 || '')) missing.push(`${fieldPath}.cropSha256`);
        if (!validBounds(field?.bounds)) missing.push(`${fieldPath}.bounds`);
        // Empty OCR and zero confidence are legitimate retained evidence. The
        // UI records an unrecognised field as null (rather than inventing an
        // empty string), so require the key but accept string or null.
        if (!(typeof field?.rawOcr === 'string' || field?.rawOcr === null)) missing.push(`${fieldPath}.rawOcr`);
        if (typeof field?.confidence !== 'number' || !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1) missing.push(`${fieldPath}.confidence`);
      });
    });
  });
  return { valid: missing.length === 0, missing };
}

function groupBy(values, key) {
  const groups = new Map();
  for (const value of values) {
    const identity = key(value);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(value);
  }
  return groups;
}

export async function aggregateBatchReports({ runDir, expectedInventoryPath, expectedCount = 500 }) {
  runDir = path.resolve(runDir);
  expectedInventoryPath = path.resolve(expectedInventoryPath);
  const manifest = await readJson(path.join(runDir, 'manifest.json'));
  const expected = await readJson(expectedInventoryPath);
  const inventory = Array.isArray(expected) ? expected : expected.inventory;
  if (!Array.isArray(inventory)) throw new TypeError('expected inventory must be an array or contain inventory');
  const issues = [];
  if (inventory.length !== expectedCount) issues.push(`Require exactly ${expectedCount} source inventory records; found ${inventory.length}`);
  if (JSON.stringify(inventory) !== JSON.stringify(manifest.inventory)) issues.push('expected inventory differs from run manifest');
  let checkpoint;
  try { checkpoint = await readJson(path.join(runDir, 'checkpoint.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; checkpoint = { results: [], batchStates: {} }; issues.push('checkpoint missing'); }
  for (const key of ['buildId', 'processingVersion', 'gitCommit', 'runIdentity']) {
    if (!nonempty(manifest[key])) issues.push(`manifest ${key} missing`);
    if (checkpoint[key] !== undefined && checkpoint[key] !== manifest[key]) issues.push(`checkpoint ${key} mismatch`);
  }
  if (!Array.isArray(checkpoint.results)) throw new TypeError('checkpoint results must be an array');
  // Read referenced reports and direct batch-* attempt directories in this run
  // only. Do not crawl fixtures, other runs, or aggregate output directories.
  const raw = checkpoint.results.map(value => ({ ...value, evidenceReport: path.join(runDir, 'checkpoint.json') }));
  const batchReports = new Map();
  for (const [batchId, state] of Object.entries(checkpoint.batchStates || {})) {
    if (!state?.outDir) continue;
    batchReports.set(path.resolve(runDir, state.outDir, 'report.json'), batchId);
  }
  for (const entry of await fs.readdir(runDir, { withFileTypes: true })) {
    const match = /^batch-(\d{3})(?:-|$)/.exec(entry.name);
    if (entry.isDirectory() && match) batchReports.set(path.join(runDir, entry.name, 'report.json'), match[1]);
  }
  for (const [file, batchId] of batchReports) {
    try {
      const report = await readJson(file);
      if (!Array.isArray(report.results)) throw new TypeError('results must be an array');
      raw.push(...report.results.map(value => ({ ...value, batchId: value.batchId || batchId, evidenceReport: file })));
    } catch (error) { issues.push(`batch report unavailable: ${file}: ${error.message}`); }
  }
  const attempts = [];
  const mirrors = new Map();
  for (const value of raw) {
    const key = JSON.stringify([value.fixturePath, value.sourceSha256, value.batchId, value.tracePath, value.startedAt, value.completedAt, value.processingStatus]);
    const previous = mirrors.get(key);
    // Collapse only cross-document copies. Repetition within a document is a
    // duplicate result and must stay visible to the processing integrity check.
    if (previous && !previous.evidenceReports.includes(value.evidenceReport)) {
      for (const field of ['buildId', 'processingVersion', 'status', 'reviewStatus']) {
        if (value[field] !== previous[field] && value[field] !== undefined && previous[field] !== undefined) {
          issues.push(`conflicting mirrored ${field}: ${value.fixturePath}: ${value.evidenceReport}`);
        }
      }
      previous.evidenceReports.push(value.evidenceReport);
      if (needsReview(value)) previous.reviewStatus = 'review_required';
    } else {
      const attempt = { ...value, evidenceReports: [value.evidenceReport] };
      attempts.push(attempt); mirrors.set(key, attempt);
    }
  }
  const byPath = groupBy(attempts, value => value.fixturePath);
  const aggregatedAt = new Date().toISOString();
  const traceCache = new Map();
  const records = [];
  const traceIntegrity = [];
  const inventoryOccurrences = new Set();
  for (const [inventoryIndex, item] of inventory.entries()) {
    const ranges = (manifest.batches || []).filter(b => Number.isSafeInteger(b.offset) && Number.isSafeInteger(b.limit) && inventoryIndex >= b.offset && inventoryIndex < b.offset + b.limit);
    const batchId = ranges[0]?.batchId ?? null;
    const occurrenceKey = JSON.stringify([item.fixturePath, item.sourceSha256]);
    const repeatedOccurrence = inventoryOccurrences.has(occurrenceKey);
    inventoryOccurrences.add(occurrenceKey);
    // Path+SHA cannot disambiguate identical inventory occurrences. Reject the
    // later occurrence rather than count the same processing attempt twice.
    if (repeatedOccurrence) issues.push(`duplicate inventory occurrence at index ${inventoryIndex}: ${item.fixturePath}`);
    const matching = repeatedOccurrence ? [] : (byPath.get(item.fixturePath) || []).filter(r => r.sourceSha256 === item.sourceSha256);
    const result = matching.filter(r => r.evidenceReports.includes(path.join(runDir, 'checkpoint.json'))).at(-1) || matching.at(-1);
    const missing = [];
    if (!SHA256.test(item.sourceSha256 || '')) missing.push('inventory sourceSha256');
    if (!nonempty(item.fixturePath)) missing.push('fixturePath');
    if (ranges.length !== 1) missing.push('batch range absent or overlapping');
    let status = result?.status ?? 'not_run';
    if (!STATUSES.includes(status)) { missing.push(`unsupported status: ${status}`); status = 'failed'; }
    let trace = null;
    const tracePath = result?.tracePath ? path.resolve(runDir, result.tracePath) : null;
    if (result) {
      for (const attempt of matching) {
        if (attempt.processingStatus !== undefined && attempt.processingStatus !== attempt.status
          && !(attempt.processingStatus === 'completed' && attempt.status === 'review_required')) {
          missing.push(`processingStatus/status contradiction: ${attempt.processingStatus}/${attempt.status}`);
          status = 'failed';
        }
      }
      for (const key of ['buildId', 'processingVersion']) {
        if (!nonempty(result[key])) missing.push(key);
        else if (result[key] !== manifest[key]) missing.push(`${key} mismatch`);
      }
      if (result.batchId !== batchId) missing.push('batchId mismatch');
      if (status !== 'not_run') {
        for (const key of ['startedAt', 'completedAt']) {
          // A duplicate skip did not process the source. Retain absent timing
          // as null; provenance and the processed representative remain required.
          if (status === 'skipped_duplicate' && result[key] == null) continue;
          if (!nonempty(result[key]) || !Number.isFinite(Date.parse(result[key]))) missing.push(key);
        }
        if (!tracePath) missing.push('tracePath');
        else {
          if (!traceCache.has(tracePath)) {
            try { const parsed = await readJson(tracePath); traceCache.set(tracePath, { trace: parsed, ...validateTraceEvidence(parsed) }); }
            catch (error) { traceCache.set(tracePath, { valid: false, missing: [`trace unreadable/unparseable: ${error.message}`] }); }
          }
          const evidence = traceCache.get(tracePath); trace = evidence.trace;
          missing.push(...evidence.missing);
          if (trace && (!Array.isArray(trace.items) || trace.items.some(value => sourceSha(value) !== item.sourceSha256))) missing.push('trace sourceSha256 mismatch');
        }
      }
      if (matching.some(needsReview) || traceNeedsReview(trace)) {
        if (status !== 'skipped_duplicate' && status !== 'failed' && status !== 'not_run') status = 'review_required';
      }
      if (missing.length && status === 'completed') status = 'failed';
    }
    const record = {
      inventoryIndex, fixturePath: item.fixturePath, sourceSha256: item.sourceSha256, batchId,
      tracePath, buildId: result?.buildId ?? manifest.buildId ?? null,
      processingVersion: result?.processingVersion ?? manifest.processingVersion ?? null,
      startedAt: result?.startedAt ?? null, completedAt: result?.completedAt ?? null,
      sourceModifiedAt: item.modifiedTime ?? null, aggregatedAt, status,
      reviewStatus: matching.some(needsReview) || traceNeedsReview(trace) ? 'review_required' : null,
      processingStatus: result?.processingStatus ?? 'not_run', duplicateOf: result?.duplicateOf ?? null,
      evidenceReports: matching.flatMap(value => value.evidenceReports), attemptCount: matching.length,
    };
    records.push(record);
    traceIntegrity.push({ ...record, valid: Boolean(result) && status !== 'not_run' && missing.length === 0, missing: result ? missing : ['result not_run', ...missing] });
  }
  const duplicateSources = [...groupBy(records, r => r.sourceSha256)].filter(([, values]) => values.length > 1)
    .map(([sourceSha256, occurrences]) => ({ sourceSha256, occurrences }));
  const processing = attempts.filter(r => r.processingStatus !== 'skipped_duplicate' && r.status !== 'skipped_duplicate' && r.status !== 'not_run');
  const duplicateProcessing = [...groupBy(processing, r => r.sourceSha256)].filter(([, values]) => values.length > 1)
    .map(([sourceSha256, occurrences]) => ({ sourceSha256, occurrences }));
  const unexpectedResults = attempts.filter(r => !inventory.some(item => item.fixturePath === r.fixturePath && item.sourceSha256 === r.sourceSha256));
  for (const record of records.filter(r => r.status === 'skipped_duplicate')) {
    const representative = records.find(r => r.sourceSha256 === record.sourceSha256 && r.fixturePath === record.duplicateOf
      && ['completed', 'review_required'].includes(r.status) && traceIntegrity[r.inventoryIndex].valid);
    if (!representative) { const check = traceIntegrity[record.inventoryIndex]; check.valid = false; check.missing.push('skipped_duplicate lacks valid representative'); }
  }
  const missingRecords = records.filter(r => r.status === 'not_run');
  const missingRanges = [];
  for (const record of missingRecords) {
    const last = missingRanges.at(-1);
    if (last && last.endIndex + 1 === record.inventoryIndex) { last.endIndex++; last.count++; }
    else missingRanges.push({ startIndex: record.inventoryIndex, endIndex: record.inventoryIndex, count: 1 });
  }
  const counts = Object.fromEntries(STATUSES.map(status => [status, records.filter(r => r.status === status).length]));
  const incomplete = inventory.length !== expectedCount || missingRecords.length > 0;
  const invalid = issues.length > 0 || traceIntegrity.some(r => !r.valid) || duplicateProcessing.length > 0 || unexpectedResults.length > 0 || counts.failed > 0;
  const status = incomplete ? 'incomplete' : invalid ? 'failed' : counts.review_required > 0 ? 'review_required' : 'passed';
  // A fresh directory and exclusive writes preserve every prior report.
  const outputDir = path.join(runDir, `aggregate-${randomUUID()}`);
  await fs.mkdir(outputDir);
  const common = { schema: 'digital-evidence.batch-aggregate.v1', runDir, expectedInventoryPath, expectedCount,
    runIdentity: manifest.runIdentity ?? null, gitCommit: manifest.gitCommit ?? null,
    generatedAt: aggregatedAt, checkpointUpdatedAt: checkpoint.updatedAt ?? null, status, inventoryCount: inventory.length, counts, issues, records };
  const report = { ...common, outputDir, missingRanges, missingRecords, duplicateSources, duplicateProcessing, unexpectedResults, traceIntegrity };
  for (const [name, value] of Object.entries({ 'aggregate-report.json': report,
    'missing.json': { ...common, missingRanges, missingRecords },
    'duplicates.json': { ...common, duplicateSources, duplicateProcessing, unexpectedResults },
    'trace-integrity.json': { ...common, traceIntegrity } })) {
    await fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  }
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { 'run-dir': { type: 'string' }, 'expected-inventory': { type: 'string' }, 'expected-count': { type: 'string', default: '500' } } });
  if (!values['run-dir'] || !values['expected-inventory']) throw new Error('Require --run-dir and --expected-inventory');
  const expectedCount = Number(values['expected-count']);
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) throw new Error('expected-count must be a positive integer');
  const report = await aggregateBatchReports({ runDir: values['run-dir'], expectedInventoryPath: values['expected-inventory'], expectedCount });
  console.log(JSON.stringify({ status: report.status, counts: report.counts, outputDir: report.outputDir }));
}
