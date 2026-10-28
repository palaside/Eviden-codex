import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "batch-local-e2e"));
const limit = Number(process.env.E2E_BATCH_LIMIT || 20);
const requestedRoots = (process.env.E2E_FIXTURE_ROOTS || "For Test\\แชทที่ 1;For Test\\แชทที่ 2;For Test\\แชทที่ 3;For Test\\Done").split(";").filter(Boolean);
const allFiles = [];
for (const relativeRoot of requestedRoots) {
  const absoluteRoot = path.resolve(root, relativeRoot);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))) {
    if (/\.(?:jpe?g|png)$/i.test(entry.name)) allFiles.push(path.join(absoluteRoot, entry.name));
  }
}
const fixtures = allFiles.slice(0, limit);
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
const writePartialReport = async () => {
  await fs.writeFile(path.join(outDir, "partial-report.json"), JSON.stringify({ schema: "digital-evidence.e2e-batch-local.partial.v1", baseUrl, requestedLimit: limit, processed: results.length, results }, null, 2), "utf8");
};
for (const [index, fixture] of fixtures.entries()) {
  const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
  page.setDefaultTimeout(30_000);
  const result = { index: index + 1, fixture, steps: [], apiResponses: [], consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => { if (message.type() === "error") result.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => result.pageErrors.push(error.stack || error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/")) result.apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
  });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.locator("#evidence-file-input").setInputFiles(fixture);
    await page.getByText(path.basename(fixture), { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
    await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 120_000 });
    const body = await page.locator("body").innerText();
    const candidateCount = Number(body.match(/สลิปที่ตรวจพบ (\d+) ใบ/)?.[1] || 0);
    const autoYoloFinished = body.includes("เพิ่ม candidate รอตรวจ") || body.includes("สกัดด้วย YOLO + Tesseract ไม่สำเร็จ");
    const traceDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
    const traceDownload = await traceDownloadPromise;
    const tracePath = path.join(outDir, `${String(index + 1).padStart(3, "0")}-trace.json`);
    await traceDownload.saveAs(tracePath);
    const trace = JSON.parse(await fs.readFile(tracePath, "utf8"));
    const traceItems = Array.isArray(trace.items) ? trace.items : [];
    const traceCandidates = traceItems.flatMap((item) => Array.isArray(item.candidates) ? item.candidates : []);
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
      noExternalProviderCall: !result.apiResponses.some((item) => item.url.includes("/api/slips/extract")),
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
    };
    if (candidateCount > 0 || result.consoleErrors.length || result.pageErrors.length) {
      await page.screenshot({ path: path.join(outDir, `${String(index + 1).padStart(3, "0")}-${path.parse(fixture).name.replace(/[^a-zA-Z0-9_-]+/g, "_")}.png`), fullPage: true });
    }
  } catch (error) {
    result.error = error instanceof Error ? error.stack || error.message : String(error);
    await page.screenshot({ path: path.join(outDir, `${String(index + 1).padStart(3, "0")}-error.png`), fullPage: true }).catch(() => {});
  } finally {
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
  providerCalls: results.reduce((sum, item) => sum + (item.assertions?.noExternalProviderCall ? 0 : 1), 0),
  consoleErrorCases: results.filter((item) => (item.assertions?.consoleErrors || 0) > 0).length,
  pageErrorCases: results.filter((item) => (item.assertions?.pageErrors || 0) > 0).length,
  results,
};
await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ outDir, processed: report.processed, failed: report.failed, candidatesDetected: report.candidatesDetected, traceCandidates: report.traceCandidates, amountPresent: report.amountPresent, referencePresent: report.referencePresent, senderNamePresent: report.senderNamePresent, receiverNamePresent: report.receiverNamePresent, needsReview: report.needsReview, sourceSha256Present: report.sourceSha256Present, sourcePagePresent: report.sourcePagePresent, providerCalls: report.providerCalls, consoleErrorCases: report.consoleErrorCases, pageErrorCases: report.pageErrorCases }, null, 2));
if (report.failed > 0 || report.providerCalls > 0 || report.pageErrorCases > 0) process.exitCode = 1;
