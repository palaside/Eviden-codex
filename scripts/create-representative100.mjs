import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { validateTraceEvidence } from "./aggregate-batch500.mjs";

const TERMINAL = new Set(["completed", "review_required", "failed", "skipped_duplicate"]);

export function selectRepresentativeRecords({ inventory, results, limit = 100 }) {
  const byOccurrence = new Map(results.map((result) => [`${result.fixturePath}\u0000${result.sourceSha256}`, result]));
  const selected = [];
  for (const [inventoryIndex, item] of inventory.entries()) {
    const result = byOccurrence.get(`${item.fixturePath}\u0000${item.sourceSha256}`);
    if (!result || !TERMINAL.has(result.status)) continue;
    selected.push({ inventoryIndex, fixturePath: item.fixturePath, sourceSha256: item.sourceSha256, result });
    if (selected.length === limit) break;
  }
  return selected;
}

export async function createRepresentativeReport({ runDir, limit = 100 }) {
  const resolvedRunDir = path.resolve(runDir);
  const [manifest, checkpoint] = await Promise.all([
    fs.readFile(path.join(resolvedRunDir, "manifest.json"), "utf8").then(JSON.parse),
    fs.readFile(path.join(resolvedRunDir, "checkpoint.json"), "utf8").then(JSON.parse),
  ]);
  const selected = selectRepresentativeRecords({ inventory: manifest.inventory, results: checkpoint.results, limit });
  if (selected.length !== limit) throw new Error(`Need ${limit} terminal records; found ${selected.length}`);
  const records = [];
  for (const entry of selected) {
    const tracePath = entry.result.tracePath ? path.resolve(entry.result.tracePath) : null;
    let traceEvidence = { valid: false, missing: ["tracePath missing"] };
    if (tracePath) {
      try { traceEvidence = validateTraceEvidence(JSON.parse(await fs.readFile(tracePath, "utf8"))); }
      catch (error) { traceEvidence = { valid: false, missing: [`trace unreadable: ${error.message}`] }; }
    }
    records.push({
      inventoryIndex: entry.inventoryIndex,
      fixturePath: entry.fixturePath,
      sourceSha256: entry.sourceSha256,
      status: entry.result.status,
      processingStatus: entry.result.processingStatus || null,
      reviewStatus: entry.result.reviewStatus || null,
      tracePath,
      traceEvidence,
      duplicateOf: entry.result.duplicateOf || null,
      buildId: entry.result.buildId || manifest.buildId,
      processingVersion: entry.result.processingVersion || manifest.processingVersion,
      startedAt: entry.result.startedAt || null,
      completedAt: entry.result.completedAt || null,
    });
  }
  const counts = Object.fromEntries([...TERMINAL].map((status) => [status, records.filter((record) => record.status === status).length]));
  const invalidTraceCount = records.filter((record) => !record.traceEvidence.valid).length;
  const report = {
    schema: "digital-evidence.representative-100.v1",
    generatedAt: new Date().toISOString(),
    selectionRule: "first terminal records in immutable manifest inventory order; no rerun and no mutation of the batch checkpoint",
    requestedLimit: limit,
    runDir: resolvedRunDir,
    runIdentity: manifest.runIdentity,
    buildId: manifest.buildId,
    gitCommit: manifest.gitCommit,
    processingVersion: manifest.processingVersion,
    checkpointUpdatedAt: checkpoint.updatedAt || null,
    status: counts.failed > 0 || invalidTraceCount > 0 ? "failed" : counts.review_required > 0 ? "review_required" : "passed",
    counts,
    uniqueSourceSha256: new Set(records.map((record) => record.sourceSha256)).size,
    invalidTraceCount,
    records,
  };
  const outputDir = path.join(resolvedRunDir, `representative-${limit}-${randomUUID()}`);
  await fs.mkdir(outputDir);
  const reportPath = path.join(outputDir, "representative-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return { report, outputDir, reportPath };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { "run-dir": { type: "string" }, limit: { type: "string", default: "100" } } });
  if (!values["run-dir"]) throw new Error("Require --run-dir");
  const { report, outputDir } = await createRepresentativeReport({ runDir: values["run-dir"], limit: Number(values.limit) });
  console.log(JSON.stringify({ status: report.status, counts: report.counts, invalidTraceCount: report.invalidTraceCount, outputDir }));
}
