import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  buildArtifactManifest,
  buildEvidenceEntry,
  DUAL_STREAM_CAPTURE_KEY,
  DUAL_STREAM_CAPTURE_MAX_BODY_BYTES,
  finalizeTask5ReportStatus,
  installDualStreamFetchCapture,
  isPathWithin,
  readDualStreamFetchCapture,
} from "./e2e-dual-stream-detection-helpers.mjs";

// Observes the real upload/process path; never intercepts or supplies app results.
const args = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const appUrl = argument("--app-url", "http://127.0.0.1:38773");
const fixture = path.resolve(argument("--fixture", "For Test/แชทที่ 3/chatv3 (15).jpg"));
const evidenceRoot = path.resolve("For Test Results/dual-stream-detection-20261030");
const requestedOutDir = path.resolve(argument("--out-dir", evidenceRoot));
const timeout = Number(argument("--timeout-ms", "900000"));
const bodyCaptureTimeout = Math.min(Math.max(timeout, 1), 180000);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const started = Date.now();
const startedAt = new Date(started).toISOString();
const runId = `run-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
const report = {
  schema: "digital-evidence.dual-stream.e2e.v2", runId, startedAt, appUrl, fixture,
  expectedSlipCount: 2, extractionStatus: "not_started", extractionObservation: "not_observed", reviewOnly: null,
  detectedSlipCount: null, detectionPass: false, workflowCompleted: false,
  status: "RUNNING", steps: [], checks: {}, consoleErrors: [], pageErrors: [],
  apiResponses: [], failedRequests: [], evidence: [], concerns: [],
  lineage: { runId, startedAt },
  responseBodyCapture: {
    mode: "page-context.fetch-clone-reader", captureKey: DUAL_STREAM_CAPTURE_KEY,
    maxBodyBytes: DUAL_STREAM_CAPTURE_MAX_BODY_BYTES, timeoutMs: bodyCaptureTimeout,
  },
  ownedResources: { browser: false, devServer: false, tempDirectories: [] },
};
let browser;
let context;
let page;
let runDir;
let artifactManifestWritten = false;
const evidencePath = (label) => path.join(runDir, `${runId}__${label}`);
const evidenceEntry = (type, label, capturedAt = new Date().toISOString()) => buildEvidenceEntry({ runId, type, label, capturedAt });
const saveJson = (name, value) => fs.writeFile(evidencePath(name), JSON.stringify(value, null, 2), "utf8");
const saveText = (name, value) => fs.writeFile(evidencePath(name), value, "utf8");
const recordEvidence = (type, label, capturedAt) => { const entry = evidenceEntry(type, label, capturedAt); report.evidence.push(entry); return entry; };
const check = (name, value) => { report.checks[name] = Boolean(value); };
const step = (action, feedback, nextAction) => report.steps.push({
  at: new Date().toISOString(), action, immediateVisualFeedback: feedback, nextAction,
});
const screenshot = async (name) => {
  await page.screenshot({ path: evidencePath(name), fullPage: true, timeout: 30000 });
  recordEvidence("screenshot", name);
};
const createRunDirectory = async () => {
  if (!isPathWithin(requestedOutDir, evidenceRoot)) throw new Error(`--out-dir must remain under ${evidenceRoot}; received ${requestedOutDir}`);
  await fs.mkdir(requestedOutDir, { recursive: true });
  runDir = path.join(requestedOutDir, runId);
  await fs.mkdir(runDir, { recursive: false });
  report.lineage = { runId, startedAt, evidenceRoot, runDir };
};
const writeArtifactManifest = async () => {
  if (!runDir || artifactManifestWritten) return;
  const capturedAt = new Date().toISOString();
  await saveJson("artifact-manifest.json", buildArtifactManifest({
    runId, startedAt, capturedAt, sourceSha256: report.sourceSha256Before ?? null,
    artifacts: report.bridgeArtifacts ?? [], artifactValidation: report.artifactValidation ?? [],
  }));
  report.artifactManifest = evidenceEntry("artifact-manifest", "artifact-manifest.json", capturedAt);
  artifactManifestWritten = true;
};
await createRunDirectory();
const captureFinalState = async () => {
  const capturedAt = new Date().toISOString();
  if (!page) {
    report.finalCanvasState = { status: "blocked", reason: "browser_page_not_started", capturedAt, runId };
    await saveJson("final-state.json", report.finalCanvasState).catch(() => {});
    recordEvidence("final-state", "final-state.json", capturedAt);
    return;
  }
  try {
    const bodyText = await page.locator("body").innerText({ timeout: 10000 });
    await saveText("ui-final.txt", bodyText);
    recordEvidence("ui-final", "ui-final.txt", capturedAt);
    const controls = page.getByTestId("research-run-controls");
    const controlsPresent = await controls.count() > 0;
    const controlsText = controlsPresent ? await controls.innerText({ timeout: 10000 }) : "";
    const labels = page.getByTestId("research-canvas-label");
    const labelPresent = await labels.count() > 0;
    const canvasCount = await page.locator("canvas").count();
    const processButton = page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ });
    const processButtonPresent = await processButton.count() > 0;
    const processIdle = processButtonPresent && await processButton.isEnabled().catch(() => false);
    report.finalCanvasState = {
      status: controlsPresent && labelPresent && canvasCount > 0 && processIdle ? "captured" : "blocked",
      reason: controlsPresent && labelPresent && canvasCount > 0 && processIdle ? null : "final_canvas_or_idle_control_not_observed",
      capturedAt, runId, canvasCount, controlsPresent, controlsText,
      canvasLabel: labelPresent ? await labels.first().innerText().catch(() => "") : "",
      processButtonPresent, processIdle, reviewOnly: report.reviewOnly, extractionStatus: report.extractionStatus,
    };
    report.workflowCompleted = report.finalCanvasState.status === "captured";
    await saveJson("final-state.json", report.finalCanvasState);
    recordEvidence("final-state", "final-state.json", capturedAt);
    if (canvasCount > 0) await screenshot("final-canvas.png");
  } catch (error) {
    report.finalCanvasState = {
      status: "blocked", reason: "final_state_capture_failed", error: error.stack || String(error),
      capturedAt, runId, reviewOnly: report.reviewOnly, extractionStatus: report.extractionStatus,
    };
    await saveJson("final-state.json", report.finalCanvasState).catch(() => {});
    recordEvidence("final-state", "final-state.json", capturedAt);
  }
};
try {
  const before = await fs.readFile(fixture);
  report.sourceSha256Before = sha256(before);
  report.sourceDimensions = await sharp(before).metadata().then(({ width, height }) => ({ width, height }));
  browser = await chromium.launch({ headless: true });
  report.ownedResources.browser = true;
  context = await browser.newContext({ viewport: { width: 1662, height: 1548 }, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push({ at: new Date().toISOString(), text: message.text() }); });
  page.on("pageerror", (error) => report.pageErrors.push({ at: new Date().toISOString(), error: error.stack || error.message }));
  page.on("requestfailed", (request) => report.failedRequests.push({ at: new Date().toISOString(), url: request.url(), error: request.failure()?.errorText }));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/")) {
      report.apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
    }
  });
  await installDualStreamFetchCapture(page, {
    runId,
    maxBodyBytes: DUAL_STREAM_CAPTURE_MAX_BODY_BYTES,
    captureKey: DUAL_STREAM_CAPTURE_KEY,
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  report.exactAppUrl = page.url();
  const input = page.locator("#evidence-file-input");
  await input.waitFor({ state: "attached", timeout: 120000 });
  // The live clock starts in an effect after hydration; SSR buttons alone do not prove readiness.
  await page.waitForFunction(() => /\d{2}:\d{2}:\d{2}/.test(document.body.innerText), undefined, { timeout: 60000 });
  const chatMode = page.getByRole("button", { name: "CHAT (แชท)", exact: true });
  await chatMode.click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("CHAT") && b.className.includes("bg-sky-500/25")));
  await input.setInputFiles(fixture);
  await page.waitForFunction((name) => document.body.innerText.includes(name), path.basename(fixture), { timeout: 60000 });
  check("uploadedFileVisible", (await page.locator("body").innerText()).includes(path.basename(fixture)));
  step("คลิก CHAT แล้วเลือกไฟล์หลักฐานผ่าน file input จริง", "Staging Buffer แสดงชื่อไฟล์ " + path.basename(fixture), "กดเริ่มประมวลผลพยานหลักฐาน");
  await screenshot("01-upload.png");
  const bridgeResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/research/dual-stream" && response.request().method() === "POST", { timeout });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  step("คลิกเริ่มประมวลผลพยานหลักฐาน", "ปุ่มเปลี่ยนเป็นกำลังประมวลผลแบบ Cross-Matching", "รอ bridge และ processing flow จริงจบ");
  const response = await bridgeResponse;
  report.bridgeStatus = response.status();
  const bridgeCapture = await readDualStreamFetchCapture(page, {
    timeoutMs: bodyCaptureTimeout,
  });
  report.bridgeHeaders = bridgeCapture.headers;
  report.responseBodyCapture = {
    ...report.responseBodyCapture,
    state: bridgeCapture.state,
    runId: bridgeCapture.runId,
    status: bridgeCapture.status,
    statusText: bridgeCapture.statusText,
    headers: bridgeCapture.headers,
    bodyLength: bridgeCapture.bodyLength,
    bodyReadCount: bridgeCapture.bodyReadCount,
    matchedRequestCount: bridgeCapture.matchedRequestCount,
    truncated: bridgeCapture.truncated,
    capturedAt: bridgeCapture.capturedAt,
    error: bridgeCapture.error,
  };
  const captureContract = bridgeCapture.state === "captured"
    && bridgeCapture.runId === runId
    && bridgeCapture.target?.method === "POST"
    && bridgeCapture.target?.path === "/api/research/dual-stream"
    && bridgeCapture.status === report.bridgeStatus
    && bridgeCapture.bodyReadCount === 1
    && bridgeCapture.matchedRequestCount === 1
    && bridgeCapture.truncated === false
    && typeof bridgeCapture.body === "string"
    && bridgeCapture.bodyLength <= DUAL_STREAM_CAPTURE_MAX_BODY_BYTES;
  check("bridgeCaptureContract", captureContract);
  if (!captureContract) throw new Error(`Invalid page-context bridge capture: ${JSON.stringify(report.responseBodyCapture)}`);
  const payload = JSON.parse(bridgeCapture.body);
  const capturedAt = new Date().toISOString();
  await saveJson("bridge-response.json", { ...payload, _evidence: { runId, startedAt, capturedAt, appUrl: report.exactAppUrl } });
  recordEvidence("bridge-response", "bridge-response.json", capturedAt);
  check("bridgeSuccess", response.ok() && payload.success === true);
  const manifest = payload.manifest;
  report.reviewOnly = payload.reviewOnly === true && manifest?.reviewOnly === true;
  report.extractionStatus = manifest?.extractionResult?.status ?? "not_started";
  report.extractionObservation = manifest ? "observed" : "not_observed";
  if (manifest) {
    report.manifest = manifest;
    report.expectedSlipCount = manifest.expectedSlipCount;
    report.detectedSlipCount = manifest.streamB?.detections?.length ?? null;
    report.detectionPass = report.detectedSlipCount === 2;
    const artifacts = payload.artifacts || [];
    report.bridgeArtifacts = artifacts;
    report.artifactCounts = {
      total: artifacts.length, streamA: manifest.streamA?.artifacts?.length || 0,
      streamBSlips: manifest.streamB?.slips?.length || 0,
      streamB: artifacts.filter((a) => a.stream === "B").length,
    };
    check("sourceShaMatchesManifest", manifest.source?.sha256 === report.sourceSha256Before);
    check("expectedCountIsTwo", manifest.expectedSlipCount === 2);
    check("detectionGateConsistent", manifest.detectionResult?.pass === report.detectionPass
      && manifest.detectionResult?.detectedCount === report.detectedSlipCount);
    check("extractionRemainsUnconfirmed", report.extractionStatus === "not_started" || report.reviewOnly);
    check("allArtifactsReviewOnly", report.reviewOnly && artifacts.every((a) => a.reviewOnly === true));
    report.artifactValidation = [];
    for (const [index, artifact] of artifacts.entries()) {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(artifact.url || "")) throw new Error("Artifact missing embedded raster");
      const bytes = Buffer.from(artifact.url.split(",")[1], "base64");
      const meta = await sharp(bytes).metadata();
      const name = `${runId}__artifact-${String(index + 1).padStart(2, "0")}.${meta.format === "jpeg" ? "jpg" : meta.format}`;
      await fs.writeFile(path.join(runDir, name), bytes);
      report.artifactValidation.push({ artifactPath: artifact.artifactPath, file: name, runId, capturedAt,
        sha256: sha256(bytes), hashMatches: sha256(bytes) === artifact.artifactSha256,
        sourceMatches: artifact.sourceSha256 === report.sourceSha256Before,
        dimensionsMatch: meta.width === artifact.dimensions?.width && meta.height === artifact.dimensions?.height });
      recordEvidence("artifact", name, capturedAt);
    }
    check("artifactsMatchBytesAndSource", artifacts.length > 0 && report.artifactValidation.every((a) => a.hashMatches && a.sourceMatches && a.dimensionsMatch));
    check("streamAComplete", report.artifactCounts.streamA === 9);
    check("streamBCropsMatchDetections", report.artifactCounts.streamBSlips === report.detectedSlipCount);
  }
  await writeArtifactManifest();
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).waitFor({ state: "visible", timeout });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).isEnabled().then((value) => check("processControlEnabled", value));
  const controls = page.getByTestId("research-run-controls");
  report.canvasControlsText = await controls.innerText();
  await saveText("ui-after-process.txt", await page.locator("body").innerText());
  recordEvidence("ui-after-process", "ui-after-process.txt");
  check("canvasManifestVisible", Boolean(manifest) && report.canvasControlsText.includes(`ตรวจพบ ${report.detectedSlipCount}/2 จุด`));
  check("canvasSourceShaVisible", report.canvasControlsText.includes(report.sourceSha256Before));
  check("canvasReviewOnlyVisible", report.canvasControlsText.includes("review-only"));
  const select = page.getByLabel("เลือกภาพวิจัยบน Canvas");
  await select.selectOption("original");
  report.originalCanvasLabel = await page.getByTestId("research-canvas-label").innerText();
  check("originalLabelVisible", report.originalCanvasLabel.includes("ต้นฉบับ"));
  check("canvasHasPixels", await page.locator("canvas").first().evaluate((canvas) => canvas.width > 0 && canvas.height > 0 && canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0)));
  await screenshot("02-original-canvas.png");
  report.canvasOptions = await select.locator("option").evaluateAll((options) => options.map((o) => ({ value: o.value, text: o.textContent, disabled: o.disabled })));
  const derivedOption = report.canvasOptions.find((o) => !o.disabled && o.text.includes("Stream A"));
  if (derivedOption) {
    await select.selectOption(derivedOption.value);
    await page.getByTestId("review-derived-preview").waitFor();
    report.derivedCanvasLabel = await page.getByTestId("research-canvas-label").innerText();
    check("derivedLabelVisible", report.derivedCanvasLabel.includes("Derived") && report.derivedCanvasLabel.includes("Stream A"));
    await screenshot("03-derived-canvas.png");
  } else check("derivedLabelVisible", false);
  await select.selectOption("detected-overlay");
  report.overlayCanvasLabel = await page.getByTestId("research-canvas-label").innerText();
  await screenshot("04-detection-overlay.png");
  step("สลับต้นฉบับ → Stream A → กรอบตรวจพบสลิปบน Canvas", report.canvasControlsText, "บันทึก JSON Trace และผลตรวจจับตามจริง");
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
  const download = await downloadPromise;
  await download.saveAs(evidencePath("app-trace.json"));
  recordEvidence("app-trace", "app-trace.json");
  check("noPageErrors", report.pageErrors.length === 0);
  check("noConsoleErrors", report.consoleErrors.length === 0);
  check("noFailedRequests", report.failedRequests.length === 0);
  if (!report.detectionPass) report.concerns.push(`Real detector returned ${report.detectedSlipCount}/2; thresholds/models unchanged.`);
} catch (error) {
  report.status = "ERROR";
  report.error = error.stack || String(error);
  report.concerns.push("Runner/evidence capture stopped before all browser assertions completed.");
  if (page) {
    await screenshot("error.png").catch(() => {});
    await saveText("ui-error.txt", await page.locator("body").innerText().catch(() => "unavailable")).catch(() => {});
    recordEvidence("ui-error", "ui-error.txt");
  }
} finally {
  await captureFinalState();
  await writeArtifactManifest().catch((error) => report.concerns.push(`Could not write artifact manifest: ${error.stack || String(error)}`));
  if (report.sourceSha256Before) {
    try {
      report.sourceSha256After = sha256(await fs.readFile(fixture));
      report.sourceUnchanged = report.sourceSha256Before === report.sourceSha256After;
      report.sourcePreservation = { status: "checked", unchanged: report.sourceUnchanged };
    } catch (error) {
      report.sourcePreservation = { status: "blocked", reason: error.stack || String(error) };
    }
  } else report.sourcePreservation = { status: "not_checked", reason: "source_sha_before_unavailable" };
  report.cleanup = { tracingStopped: false, browserClosed: false, ownedDevServerStopped: false, tempResourcesRemoved: [] };
  if (context) {
    await context.tracing.stop({ path: evidencePath("browser-trace.zip") }).then(() => {
      report.cleanup.tracingStopped = true;
      recordEvidence("browser-trace", "browser-trace.zip");
    }).catch((error) => report.concerns.push(`Tracing cleanup failed: ${error.stack || String(error)}`));
  }
  if (browser) await browser.close().then(() => { report.cleanup.browserClosed = true; }).catch((error) => report.concerns.push(`Browser cleanup failed: ${error.stack || String(error)}`));
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  report.lineage.finishedAt = report.finishedAt;
  check("finalStateCaptured", report.finalCanvasState?.status === "captured" && report.workflowCompleted === true);
  check("sourcePreserved", report.sourceUnchanged === true
    && report.sourcePreservation?.status === "checked"
    && report.sourcePreservation.unchanged === true);
  check("cleanupComplete", report.cleanup.tracingStopped === true
    && report.cleanup.browserClosed === true
    && (!report.ownedResources.devServer || report.cleanup.ownedDevServerStopped === true));
  report.status = finalizeTask5ReportStatus(report);
  await saveJson("report.json", report);
  console.log(JSON.stringify({ status: report.status, workflowCompleted: report.workflowCompleted,
    detectedSlipCount: report.detectedSlipCount, detectionPass: report.detectionPass,
    artifactCounts: report.artifactCounts, checks: report.checks, error: report.error, runId, runDir }, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}
