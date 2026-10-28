import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "hybrid-pair-e2e"));
const fixtures = [
  path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (73).jpg"),
  path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (77).jpg"),
];
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixtures, steps: [], apiResponses: [], consoleErrors: [] };
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
page.on("response", async (response) => {
  if (!response.url().includes("/api/")) return;
  const entry = { url: response.url(), status: response.status(), method: response.request().method() };
  if (response.url().includes("/api/slips/extract")) {
    try { entry.body = await response.json(); } catch { entry.body = "<non-json>"; }
  }
  report.apiResponses.push(entry);
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  report.steps.push({ name: "open", ok: true });
  await page.locator("#evidence-file-input").setInputFiles(fixtures);
  await page.waitForFunction((names) => names.every((name) => document.body?.innerText.includes(name)), ["chatv3 (73).jpg", "chatv3 (77).jpg"], { timeout: 15_000 });
  report.steps.push({ name: "setInputFiles", ok: true });
  await page.screenshot({ path: path.join(outDir, "01-staged.png"), fullPage: true });

  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  report.steps.push({ name: "main-process", ok: true });
  await page.screenshot({ path: path.join(outDir, "02-after-main-process.png"), fullPage: true });
  await page.waitForFunction(() => document.body?.innerText.includes("เพิ่ม candidate รอตรวจ") || document.body?.innerText.includes("สกัดด้วย YOLO + Tesseract ไม่สำเร็จ"), undefined, { timeout: 300_000 });
  const autoYoloBodyText = await page.locator("body").innerText();
  report.steps.push({ name: "auto-yolo-fallback", ok: autoYoloBodyText.includes("เพิ่ม candidate รอตรวจ") });
  await page.screenshot({ path: path.join(outDir, "03-after-yolo.png"), fullPage: true });
  const traceDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
  const traceDownload = await traceDownloadPromise;
  await traceDownload.saveAs(path.join(outDir, "local-process-trace.json"));
  report.steps.push({ name: "download-local-trace", ok: true, suggestedFilename: traceDownload.suggestedFilename() });

  const geminiButtons = page.getByRole("button", { name: "Gemini", exact: true });
  const buttonCount = await geminiButtons.count();
  report.steps.push({ name: "gemini-buttons", ok: buttonCount === 2, buttonCount });
  for (let i = 0; i < buttonCount; i += 1) {
    const before = report.apiResponses.length;
    await geminiButtons.nth(i).click();
    await page.waitForFunction(() => document.body?.innerText.includes("เพิ่ม candidate รอตรวจ") || document.body?.innerText.includes("สกัดด้วย Gemini ไม่สำเร็จ"), undefined, { timeout: 300_000 });
    report.steps.push({ name: `gemini-${i + 1}`, ok: true, apiCallsAdded: report.apiResponses.length - before });
  }
  await page.waitForTimeout(1000);
  const bodyText = await page.locator("body").innerText();
  const candidateCount = Number(bodyText.match(/สลิปที่ตรวจพบ (\d+) ใบ/)?.[1] || 0);
  const amountMatches = [...new Set([
    ...[...bodyText.matchAll(/จำนวนเงิน ฿([\d,]+\.\d{2})/g)].map((match) => match[1]),
    ...[...bodyText.matchAll(/฿\s*([\d,]+\.\d{2})/g)].map((match) => match[1]),
  ])].filter((amount) => Number(amount.replace(",", "")) > 0);
  report.steps.push({ name: "final-ui", ok: true, candidateCount, amountMatches });
  report.assertions = {
    inputFiles: fixtures.every((file) => bodyText.includes(path.basename(file))),
    candidateCount,
    amountMatches,
    expectedTwoDistinctCandidates: candidateCount === 2 && ["3,000.00", "7,200.00"].every((amount) => amountMatches.includes(amount)),
    expectedAmounts: ["3,000.00", "7,200.00"],
    duplicateAmountCount: amountMatches.length - new Set(amountMatches).size,
    expectedAmount3000: amountMatches.includes("3,000.00"),
    apiExtractCalls: report.apiResponses.filter((entry) => entry.url.includes("/api/slips/extract")).length,
    consoleErrors: report.consoleErrors.length,
  };
  await page.screenshot({ path: path.join(outDir, "03-after-gemini.png"), fullPage: true });
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
  console.log(JSON.stringify({ outDir, steps: report.steps, assertions: report.assertions || null, error: report.error || null }, null, 2));
  if (!report.error && report.assertions && !report.assertions.expectedTwoDistinctCandidates) process.exitCode = 1;
}
