import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:38772/";
const fixture = path.resolve(process.env.E2E_FIXTURE || path.join(root, "For Test Results", "ttb-7200-locator", "chatv3 (73)-slip-1.png"));
const outDir = path.resolve(process.env.E2E_OUT_DIR || path.join(root, "For Test Results", "e2e-ttb-7200-local-after-candidate-fix"));
const expectedAmount = process.env.E2E_EXPECT_AMOUNT ? Number(process.env.E2E_EXPECT_AMOUNT) : null;
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixture, steps: [], apiResponses: [], consoleErrors: [], pageErrors: [] };
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
page.on("pageerror", (error) => report.pageErrors.push(error.stack || error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/")) report.apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (document.body?.innerText || "").includes("PURE ZERO STATE"), undefined, { timeout: 60_000 });
  await page.waitForTimeout(5_000);
  await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  const fixtureName = path.basename(fixture);
  await page.waitForFunction((name) => (document.body?.innerText || "").includes(name), fixtureName, { timeout: 60_000 });
  report.steps.push({ name: "clean-upload", ok: true });
  await page.screenshot({ path: path.join(outDir, "01-uploaded.png"), fullPage: true });

  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  report.steps.push({ name: "process", ok: true });
  let humanBankReviewPersistedInUi = false;
  if (process.env.E2E_REVIEW_BANK) {
    if (await page.getByLabel(/ธนาคารรายการ/).count() === 0) {
      const ledgerButton = page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ }).first();
      if (await ledgerButton.count() > 0) await ledgerButton.click();
    }
    const bankControl = page.getByLabel(/ธนาคารรายการ/).first();
    await bankControl.waitFor({ state: "visible", timeout: 30_000 });
    await bankControl.selectOption(process.env.E2E_REVIEW_BANK === "__unknown__" ? "" : process.env.E2E_REVIEW_BANK);
    await page.waitForTimeout(500);
    report.steps.push({ name: "human-bank-review", ok: true, value: process.env.E2E_REVIEW_BANK });
    await page.screenshot({ path: path.join(outDir, "03-human-bank-review.png"), fullPage: true });
    await page.waitForTimeout(1_500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((name) => (document.body?.innerText || "").includes(name), fixtureName, { timeout: 60_000 });
    if (await page.getByLabel(/ธนาคารรายการ/).count() === 0) {
      const restoredLedgerButton = page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ }).first();
      if (await restoredLedgerButton.count() > 0) await restoredLedgerButton.click();
    }
    await page.getByLabel(/ธนาคารรายการ/).first().waitFor({ state: "visible", timeout: 30_000 });
    humanBankReviewPersistedInUi = (await page.locator("body").innerText()).includes("มนุษย์เลือก");
  }
  const body = await page.locator("body").innerText();
  const bankReviewControlPresent = await page.getByLabel(/ธนาคารรายการ/).count() > 0;
  await fs.writeFile(path.join(outDir, "ui-body.txt"), body, "utf8");
  await page.screenshot({ path: path.join(outDir, "02-processed.png"), fullPage: true });

  const traceDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
  const trace = await traceDownloadPromise;
  await trace.saveAs(path.join(outDir, "diagnostic-trace.json"));
  report.steps.push({ name: "download-trace", ok: true });

  const traceJson = JSON.parse(await fs.readFile(path.join(outDir, "diagnostic-trace.json"), "utf8"));
  const item = traceJson.items?.[0];
  const data = item?.data || {};
  const humanBankReviewPersistedInTrace = item?.bankEvidence?.status === "human_reviewed"
    || item?.embeddedSlips?.some((slip) => slip?.bankEvidence?.status === "human_reviewed")
    || data?.bankEvidence?.status === "human_reviewed"
    || item?.candidates?.some((candidate) => candidate?.bankEvidence?.status === "human_reviewed");
  report.assertions = {
    sourceShaPresent: Boolean(item?.source?.sha256),
    processingRunIdPresent: Boolean(item?.processingRunId),
    ocrAttempts: item?.diagnosticCounts?.ocrAttempts || 0,
    parsedRegions: item?.diagnosticCounts?.parsedRegions || 0,
    acceptedRegions: item?.diagnosticCounts?.acceptedRegions || 0,
    tracePresent: Boolean(item?.ocrDiagnosticTrace),
    amount7200: expectedAmount === null ? Boolean(data.transaction?.amount) : data.transaction?.amount === expectedAmount,
    qrReferencePresent: Boolean(data.transaction?.reference_no),
    time1551: data.transaction?.time === "15:51",
    datePresent: Boolean(data.transaction?.date),
    senderPresent: Boolean(data.sender?.name),
    receiverPresent: Boolean(data.receiver?.name),
    bankPresent: Boolean(data.bank?.name),
    uiAmount7200: expectedAmount === null ? Boolean(data.transaction?.amount) : /7,200\.00/.test(body),
    uiReceiverPresent: data.receiver?.name ? body.includes(data.receiver.name) : false,
    uiBankPresent: data.bank?.name ? body.includes(data.bank.name) : false,
    bankReviewControlPresent,
    humanBankReviewPersistedInUi,
    humanBankReviewPersistedInTrace,
    reviewRequired: /รอตรวจ|ยังสรุปไม่ได้|อ่านไม่ได้/.test(body),
    noGeminiApi: !report.apiResponses.some((response) => response.url.includes("/api/slips/extract")),
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
  };
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
} finally {
  await browser.close();
}

console.log(JSON.stringify({ outDir, steps: report.steps, assertions: report.assertions || null, error: report.error || null }, null, 2));
if (report.error || !report.assertions?.amount7200 || !report.assertions?.tracePresent || !report.assertions?.uiAmount7200) process.exitCode = 1;
