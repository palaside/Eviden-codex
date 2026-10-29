import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "intake-diagnose"));
const fixture = path.resolve(root, process.env.E2E_FIXTURE || path.join("For Test", "แชทที่ 1", "V1- (117).jpg"));
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.E2E_EXECUTABLE_PATH ? { executablePath: process.env.E2E_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixture, events: [], consoleErrors: [], pageErrors: [], bodyAfterInput: "", inputFileCount: null };
page.on("console", (message) => report.events.push({ type: `console:${message.type()}`, text: message.text() }));
page.on("pageerror", (error) => report.pageErrors.push(error.stack || error.message));
page.on("response", (response) => {
  if (response.status() >= 400) report.events.push({ type: "http-error", status: response.status(), url: response.url(), method: response.request().method() });
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(1_000);
  const input = page.locator("#evidence-file-input");
  await input.setInputFiles(fixture);
  report.inputFileCount = await input.evaluate((element) => element.files?.length ?? -1);
  await page.waitForTimeout(5_000);
  report.bodyAfterInput = await page.locator("body").innerText();
  report.events.push({ type: "body-check", hasFilename: report.bodyAfterInput.includes(path.basename(fixture)), hasStartButton: /เริ่มประมวลผลพยานหลักฐาน/u.test(report.bodyAfterInput), hasHashError: /SHA-256|คำนวณ/u.test(report.bodyAfterInput) });
  await page.screenshot({ path: path.join(outDir, "after-input.png"), fullPage: true });
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}
console.log(JSON.stringify({ outDir, inputFileCount: report.inputFileCount, eventCount: report.events.length, consoleErrors: report.consoleErrors.length, pageErrors: report.pageErrors.length, error: report.error || null }, null, 2));
if (report.error || report.pageErrors.length > 0) process.exitCode = 1;
