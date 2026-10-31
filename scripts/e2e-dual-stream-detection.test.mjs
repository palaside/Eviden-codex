import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  buildArtifactManifest,
  buildEvidenceEntry,
  DUAL_STREAM_CAPTURE_MAX_BODY_BYTES,
  finalizeTask5ReportStatus,
  installDualStreamFetchCapture,
  readDualStreamFetchCapture,
  isPathWithin,
} from "./e2e-dual-stream-detection-helpers.mjs";

test("output scope accepts only paths under the Task 5 evidence root", () => {
  const root = "D:/Project/Digital Evi - Codex/For Test Results/dual-stream-detection-20261030";
  assert.equal(isPathWithin(`${root}/run-20261030-120000-ab12cd34`, root), true);
  assert.equal(isPathWithin("D:/Project/Digital Evi - Codex/For Test Results/other", root), false);
});

test("runner uses page-context capture without Playwright body or CDP fallback", async () => {
  const runnerSource = await fs.readFile(new URL("./e2e-dual-stream-detection.mjs", import.meta.url), "utf8");
  const helperSource = await fs.readFile(new URL("./e2e-dual-stream-detection-helpers.mjs", import.meta.url), "utf8");
  assert.match(helperSource, /page\.addInitScript/);
  assert.match(runnerSource, /installDualStreamFetchCapture/);
  assert.match(runnerSource, /readDualStreamFetchCapture/);
  assert.doesNotMatch(runnerSource, /response\.body\(\)/);
  assert.doesNotMatch(runnerSource, /Network\.getResponseBody|newCDPSession|fallbackBody/);
  assert.doesNotMatch(runnerSource, /captureResponseBody/);
});

test("runner default capture cap is 256 MiB and remains hard-bounded", async () => {
  const helperSource = await fs.readFile(new URL("./e2e-dual-stream-detection-helpers.mjs", import.meta.url), "utf8");
  assert.equal(DUAL_STREAM_CAPTURE_MAX_BODY_BYTES, 256 * 1024 * 1024);
  assert.match(helperSource, /bodyLength > maxBodyBytes/);
  assert.match(helperSource, /await reader\.cancel\(\)/);
});

test("page-context capture preserves one target response contract and bounds the object", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/api/research/dual-stream", (route) => route.fulfill({
    status: 201,
    headers: {
      "content-type": "application/json",
      "x-capture-contract": "preserved",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "x-capture-contract",
    },
    body: JSON.stringify({ success: true, runId: "server-run" }),
  }));
  await installDualStreamFetchCapture(page, { runId: "runner-run", maxBodyBytes: 4096 });
  await page.goto("data:text/html,<!doctype html><title>capture%20contract</title>", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => fetch("http://capture.test/api/research/dual-stream", { method: "POST", body: "fixture" }));

  const capture = await readDualStreamFetchCapture(page, { timeoutMs: 2000 });
  assert.equal(capture.state, "captured");
  assert.equal(capture.status, 201);
  assert.equal(capture.headers["x-capture-contract"], "preserved");
  assert.deepEqual(JSON.parse(capture.body), { success: true, runId: "server-run" });
  assert.equal(capture.bodyReadCount, 1);
  assert.equal(capture.runId, "runner-run");
  assert.ok(capture.bodyLength <= 4096);
  assert.ok(Object.keys(capture).length <= 16);
  await page.evaluate(() => fetch("http://capture.test/api/research/dual-stream", { method: "POST", body: "second" }));
  const afterSecondTargetRequest = await page.evaluate(() => window.__task5DualStreamFetchCapture);
  assert.equal(afterSecondTargetRequest.bodyReadCount, 1);
  assert.equal(afterSecondTargetRequest.matchedRequestCount, 1);
});

test("artifact manifest carries one run lineage", () => {
  const manifest = buildArtifactManifest({
    runId: "run-20261030-120000-ab12cd34",
    startedAt: "2026-10-30T12:00:00.000Z",
    capturedAt: "2026-10-30T12:01:00.000Z",
    sourceSha256: "source-sha",
    artifacts: [{ artifactPath: "stream-a/01.png" }],
    artifactValidation: [{ file: "run-20261030-120000-ab12cd34__artifact-01.png", hashMatches: true }],
  });
  assert.equal(manifest.runId, "run-20261030-120000-ab12cd34");
  assert.equal(manifest.startedAt, "2026-10-30T12:00:00.000Z");
  assert.equal(manifest.capturedAt, "2026-10-30T12:01:00.000Z");
  assert.equal(manifest.artifacts[0].file, "run-20261030-120000-ab12cd34__artifact-01.png");
});

test("status finalization uses final state and source preservation", () => {
  const report = {
    status: "RUNNING",
    checks: { browserAssertions: true },
    detectionPass: true,
    workflowCompleted: true,
    finalCanvasState: { status: "captured" },
    sourceUnchanged: true,
    sourcePreservation: { status: "checked", unchanged: true },
    cleanup: { tracingStopped: true, browserClosed: true, ownedDevServerStopped: false },
    ownedResources: { devServer: false },
  };

  assert.equal(finalizeTask5ReportStatus({
    ...report,
    workflowCompleted: false,
    finalCanvasState: { status: "blocked" },
  }), "FAIL");
  assert.equal(finalizeTask5ReportStatus(report), "PASS");

  report.sourceUnchanged = false;
  report.sourcePreservation.unchanged = false;
  assert.equal(finalizeTask5ReportStatus(report), "FAIL");
  assert.equal(finalizeTask5ReportStatus({ ...report, status: "ERROR" }), "ERROR");
  assert.equal(finalizeTask5ReportStatus({ ...report, status: "BLOCKED" }), "BLOCKED");
});

test("runner finalizes status after final-state, source, and cleanup checks", async () => {
  const runnerSource = await fs.readFile(new URL("./e2e-dual-stream-detection.mjs", import.meta.url), "utf8");
  const finalStateIndex = runnerSource.indexOf("await captureFinalState();");
  const sourceCheckIndex = runnerSource.indexOf('check("sourcePreserved"');
  const cleanupCheckIndex = runnerSource.indexOf('check("cleanupComplete"');
  const statusIndex = runnerSource.indexOf("report.status = finalizeTask5ReportStatus(report);");

  assert.ok(finalStateIndex >= 0);
  assert.ok(sourceCheckIndex > finalStateIndex);
  assert.ok(cleanupCheckIndex > sourceCheckIndex);
  assert.ok(statusIndex > cleanupCheckIndex);
});

test("every artifact evidence file resolves under runDir with one run prefix", async (t) => {
  const runDir = await fs.mkdtemp(path.join(process.cwd(), ".task5-evidence-test-"));
  t.after(() => fs.rm(runDir, { recursive: true, force: true }));
  const runId = "run-20261030-120000-ab12cd34";
  const artifactFiles = [
    `${runId}__artifact-01.png`,
    `${runId}__artifact-02.jpg`,
  ];

  for (const file of artifactFiles) {
    await fs.writeFile(path.join(runDir, file), "artifact");
    const evidence = buildEvidenceEntry({ runId, type: "artifact", label: file });
    const resolved = path.resolve(runDir, evidence.file);
    assert.equal(evidence.file, file);
    assert.equal(isPathWithin(resolved, runDir), true);
    await fs.access(resolved);
  }
});
