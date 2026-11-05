import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { auditTraceCandidates } from "./e2e-field-audit.mjs";
import { writeAtomicJson } from "./batch500-contract.mjs";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", `batch-local-e2e-${randomUUID()}`));
const buildDir = path.resolve(root, process.env.E2E_BUILD_DIR || process.env.NEXT_DIST_DIR || "build-output-enterprise");
const buildId = process.env.E2E_BUILD_ID || await fs.readFile(path.join(buildDir, "BUILD_ID"), "utf8").then((value) => value.trim()).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
const processingVersion = process.env.E2E_PROCESSING_VERSION || "batch-local-e2e.v1";
const limit = Number(process.env.E2E_BATCH_LIMIT || 20);
const requestedRoots = (process.env.E2E_FIXTURE_ROOTS || "For Test\\แชทที่ 1;For Test\\แชทที่ 2;For Test\\แชทที่ 3;For Test\\Done").split(";").filter(Boolean);
const offset = Math.max(0, Number(process.env.E2E_BATCH_OFFSET || 0));
const processingTimeoutMs = Math.max(120_000, Number(process.env.E2E_PROCESS_TIMEOUT_MS || 600_000));
const requireReviewDerivedPreview = process.env.E2E_REQUIRE_REVIEW_DERIVED_PREVIEW !== "false";
const allFiles = [];
for (const relativeRoot of requestedRoots) {
  const absoluteRoot = path.resolve(root, relativeRoot);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))) {
    if (/\.(?:jpe?g|png)$/i.test(entry.name)) allFiles.push(path.join(absoluteRoot, entry.name));
  }
}
const explicitFixtures = (process.env.E2E_FIXTURE_FILES || "").split(";").map((file) => file.trim()).filter(Boolean).map((file) => path.resolve(root, file));
const fixtures = explicitFixtures.length > 0 ? explicitFixtures : allFiles.slice(offset, offset + limit);
await fs.mkdir(path.dirname(outDir), { recursive: true });
// A prior run directory may contain evidence: fail rather than replace it.
await fs.mkdir(outDir);

const browser = await chromium.launch({
  headless: true,
  ...(process.env.E2E_EXECUTABLE_PATH ? { executablePath: process.env.E2E_EXECUTABLE_PATH } : {}),
});
const results = [];
const writePartialReport = async () => {
  await writeAtomicJson(path.join(outDir, "partial-report.json"), { schema: "digital-evidence.e2e-batch-local.partial.v1", baseUrl, requestedLimit: limit, processed: results.length, results });
};
for (const [index, fixture] of fixtures.entries()) {
  const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
  page.setDefaultTimeout(30_000);
  const result = { index: index + 1, fixture, fixturePath: fixture, sourceSha256: null, buildId, processingVersion, status: "not_run", tracePath: null, startedAt: new Date().toISOString(), completedAt: null, steps: [], apiResponses: [], consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => result.pageErrors.push(error.stack || error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/")) {
      const url = response.url();
      result.apiResponses.push({ url, status: response.status(), method: response.request().method() });
      if (/\/api\/(?:slips\/extract|slips\/slipvision|legal\/tlex)/u.test(url)) {
        result.externalProviderCall = url;
      }
    }
  });
  try {
    result.sourceSha256 = createHash("sha256").update(await fs.readFile(fixture)).digest("hex");
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.route(/\/api\/(?:slips\/extract|slips\/slipvision|legal\/tlex)/u, async (route) => {
      result.externalProviderCall = route.request().url();
      await route.abort("blockedbyclient");
    });
    await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.locator("#evidence-file-input").setInputFiles(fixture);
    await page.waitForFunction((expectedName) => document.body?.innerText.includes(expectedName), path.basename(fixture), { timeout: processingTimeoutMs });
    await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
    await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: processingTimeoutMs });
    if (result.externalProviderCall) {
      throw new Error(`external provider call detected during local-only batch: ${result.externalProviderCall}`);
    }
    const body = await page.locator("body").innerText();
    const candidateCount = Number(body.match(/สลิปที่ตรวจพบ (\d+) ใบ/)?.[1] || 0);
    const autoYoloFinished = body.includes("เพิ่ม candidate รอตรวจ") || body.includes("สกัดด้วย YOLO + Tesseract ไม่สำเร็จ");
    const traceDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
    const traceDownload = await traceDownloadPromise;
    const tracePath = path.join(outDir, `${String(index + 1).padStart(3, "0")}-trace.json`);
    await traceDownload.saveAs(tracePath);
    result.tracePath = tracePath;
    const trace = JSON.parse(await fs.readFile(tracePath, "utf8"));
    // Inspect the same evidence table a reviewer uses; canvas visibility
    // alone is not enough to prove field trace/overlay propagation to UI.
    await page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ }).click();
    await page.getByText(/ตารางสรุปรายการทางการเงินที่ตรวจพบ/).waitFor({ state: "visible", timeout: 30_000 });
    const reviewBody = await page.locator("body").innerText();
    const traceItems = Array.isArray(trace.items) ? trace.items : [];
    const traceCandidates = traceItems.flatMap((item) => Array.isArray(item.candidates) ? item.candidates : []);
    const fieldAudit = auditTraceCandidates(traceItems.flatMap((item) => (Array.isArray(item.candidates) ? item.candidates.map((candidate) => ({
      ...candidate,
      sourceSha256: candidate.sourceSha256 || item.source?.sha256 || item.sourceSha256,
    })) : [])));
    const traceData = traceCandidates.map((candidate) => candidate.data || {});
    const traceCandidateItems = traceItems.flatMap((item) => (Array.isArray(item.candidates) ? item.candidates.map((candidate) => ({ item, candidate })) : []));
    result.steps.push({ name: "upload-and-process", ok: true });
    result.assertions = {
      inputVisible: body.includes(path.basename(fixture)),
      autoYoloFinished,
      candidateCount,
      tracePath,
      traceCandidates: traceCandidates.length,
      amountPresent: traceData.filter((data) => data.transaction?.amount != null).length,
      referencePresent: traceData.filter((data) => data.transaction?.reference_no != null).length,
      senderNamePresent: traceData.filter((data) => data.sender?.name != null).length,
      receiverNamePresent: traceData.filter((data) => data.receiver?.name != null).length,
      needsReview: traceCandidates.filter((candidate) => candidate.needsReview === true && candidate.isConfirmed !== true).length,
      sourceSha256Present: traceCandidateItems.filter(({ item, candidate }) => typeof (candidate.sourceSha256 || candidate.source?.sha256 || item.source?.sha256) === "string" && (candidate.sourceSha256 || candidate.source?.sha256 || item.source?.sha256).length === 64).length,
      sourcePagePresent: traceCandidateItems.filter(({ item, candidate }) => Number.isInteger(candidate.chatPageNumber) || Number.isInteger(candidate.dossierPageNumber) || (Array.isArray(item.chatPages) && item.chatPages.length > 0)).length,
      searchableOverlayVisible: reviewBody.includes("Searchable text overlay"),
      enhancementArtifactsVisible: reviewBody.includes("Enhancement artifacts"),
      reviewDerivedPreviewVisible: body.includes("ภาพอนุพันธ์ Upscayl สำหรับช่วยดู/อ่าน"),
      stitchAuditVisible: body.includes("Stitch audit"),
      noExternalProviderCall: !result.apiResponses.some((item) => item.url.includes("/api/slips/extract")),
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
      fieldAudit,
    };
    result.status = traceCandidates.length === 0 || traceCandidates.some((candidate) => candidate.needsReview === true || candidate.isConfirmed !== true)
      ? "review_required" : "completed";
    if (candidateCount > 0 || result.consoleErrors.length || result.pageErrors.length) {
      await page.screenshot({ path: path.join(outDir, `${String(index + 1).padStart(3, "0")}-${path.parse(fixture).name.replace(/[^a-zA-Z0-9_-]+/g, "_")}.png`), fullPage: true });
    }
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.stack || error.message : String(error);
    await page.screenshot({ path: path.join(outDir, `${String(index + 1).padStart(3, "0")}-error.png`), fullPage: true }).catch(() => {});
  } finally {
    if (result.externalProviderCall || result.pageErrors.length || result.assertions?.fieldAudit?.passed !== true
      || (requireReviewDerivedPreview && result.assertions?.reviewDerivedPreviewVisible === false)) result.status = "failed";
    result.completedAt = new Date().toISOString();
    results.push(result);
    await writePartialReport();
    await page.close();
  }
}
await browser.close();
const report = {
  schema: "digital-evidence.e2e-batch-local.v1",
  baseUrl,
  requestedLimit: limit,
  processed: results.length,
  failed: results.filter((item) => item.error).length,
  candidatesDetected: results.reduce((sum, item) => sum + (item.assertions?.candidateCount || 0), 0),
  traceCandidates: results.reduce((sum, item) => sum + (item.assertions?.traceCandidates || 0), 0),
  amountPresent: results.reduce((sum, item) => sum + (item.assertions?.amountPresent || 0), 0),
  referencePresent: results.reduce((sum, item) => sum + (item.assertions?.referencePresent || 0), 0),
  senderNamePresent: results.reduce((sum, item) => sum + (item.assertions?.senderNamePresent || 0), 0),
  receiverNamePresent: results.reduce((sum, item) => sum + (item.assertions?.receiverNamePresent || 0), 0),
  needsReview: results.reduce((sum, item) => sum + (item.assertions?.needsReview || 0), 0),
  sourceSha256Present: results.reduce((sum, item) => sum + (item.assertions?.sourceSha256Present || 0), 0),
  sourcePagePresent: results.reduce((sum, item) => sum + (item.assertions?.sourcePagePresent || 0), 0),
  searchableOverlayVisible: results.filter((item) => item.assertions?.searchableOverlayVisible).length,
  enhancementArtifactsVisible: results.filter((item) => item.assertions?.enhancementArtifactsVisible).length,
  stitchAuditVisible: results.filter((item) => item.assertions?.stitchAuditVisible).length,
  reviewDerivedPreviewVisible: results.filter((item) => item.assertions?.reviewDerivedPreviewVisible).length,
  // Count only an observed blocked/provider route. Error cases may not have
  // assertions at all and must not be misclassified as provider calls.
  externalProviderCalls: results.filter((item) => Boolean(item.externalProviderCall)).length,
  consoleErrorCases: results.filter((item) => (item.assertions?.consoleErrors || 0) > 0).length,
  pageErrorCases: results.filter((item) => (item.assertions?.pageErrors || 0) > 0).length,
  fieldAuditPassed: results.filter((item) => item.assertions?.fieldAudit?.passed === true).length,
  results,
};
await writeAtomicJson(path.join(outDir, "report.json"), report);
console.log(JSON.stringify({ outDir, processed: report.processed, failed: report.failed, candidatesDetected: report.candidatesDetected, traceCandidates: report.traceCandidates, amountPresent: report.amountPresent, referencePresent: report.referencePresent, senderNamePresent: report.senderNamePresent, receiverNamePresent: report.receiverNamePresent, needsReview: report.needsReview, sourceSha256Present: report.sourceSha256Present, sourcePagePresent: report.sourcePagePresent, externalProviderCalls: report.externalProviderCalls, consoleErrorCases: report.consoleErrorCases, pageErrorCases: report.pageErrorCases }, null, 2));
if (report.failed > 0 || report.externalProviderCalls > 0 || report.pageErrorCases > 0
  || report.results.some((item) => item.assertions?.fieldAudit?.passed !== true)
  || (requireReviewDerivedPreview && report.results.some((item) => item.assertions?.reviewDerivedPreviewVisible === false))) process.exitCode = 1;
