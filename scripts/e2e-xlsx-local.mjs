import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "xlsx-e2e"));
const fixtureList = process.env.E2E_FIXTURES
  ? process.env.E2E_FIXTURES.split("|")
  : [
      path.join("For Test", "แชทที่ 3", "chatv3 (73).jpg"),
      path.join("For Test", "แชทที่ 3", "chatv3 (77).jpg"),
    ];
const fixtures = fixtureList.map((fixture) => path.resolve(root, fixture));
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixtures, steps: [], apiResponses: [], consoleErrors: [], pageErrors: [] };
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
page.on("pageerror", (error) => report.pageErrors.push(error.stack || error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/")) report.apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixtures);
  await page.waitForFunction((names) => names.every((name) => document.body?.innerText.includes(name)), fixtures.map((fixture) => path.basename(fixture)), { timeout: 30_000 });
  report.steps.push({ name: "upload", ok: true });

  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  await page.waitForFunction(() => /สลิปที่ตรวจพบ \d+ ใบ/.test(document.body?.innerText || ""), undefined, { timeout: 60_000 });
  report.steps.push({ name: "local-processing", ok: true });

  const ledgerOpenButton = page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ });
  await ledgerOpenButton.click();
  report.steps.push({ name: "open-ledger", ok: true });
  const xlsxButton = page.getByRole("button", { name: "ดาวน์โหลด XLSX 13 คอลัมน์", exact: true });
  await xlsxButton.waitFor({ state: "visible", timeout: 30_000 });
  if (await xlsxButton.isDisabled()) throw new Error("XLSX button is disabled after processing");
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await xlsxButton.click();
  const download = await downloadPromise;
  const outputPath = path.join(outDir, "evidence-ledger.xlsx");
  await download.saveAs(outputPath);
  const stat = await fs.stat(outputPath);
  report.steps.push({ name: "xlsx-export", ok: stat.size > 0 });
  report.download = { path: outputPath, suggestedFilename: download.suggestedFilename(), size: stat.size };
  report.assertions = {
    nonEmpty: stat.size > 0,
    noProviderCall: !report.apiResponses.some((item) => item.url.includes("/api/slips/extract")),
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
  };
  await page.screenshot({ path: path.join(outDir, "01-after-xlsx.png"), fullPage: true });
  if (!report.assertions.nonEmpty || !report.assertions.noProviderCall || report.consoleErrors.length || report.pageErrors.length) throw new Error("XLSX E2E assertions failed");
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await page.close();
  await browser.close();
}
console.log(JSON.stringify({ outDir, steps: report.steps, download: report.download || null, error: report.error || null }, null, 2));
