import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const fixture = path.resolve(root, process.env.E2E_FIXTURE || "For Test/Done/A4_IMG_ (1).JPEG");
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || "For Test Results/e2e-ttb-26400-runner-fix");
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: process.env.E2E_HEADLESS !== "false",
  executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined,
  args: ["--no-sandbox", "--proxy-server=direct://", "--proxy-bypass-list=*"]
});
const context = await browser.newContext({ viewport: { width: 1662, height: 1548 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });

const report = { baseUrl, fixture, generatedAt: new Date().toISOString(), passed: false, errors };
try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByText(path.basename(fixture), { exact: true }).waitFor({ state: "visible", timeout: 180_000 });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  const bodyText = await page.locator("body").innerText();
  report.observed = {
    source: bodyText.includes(path.basename(fixture)),
    amount: bodyText.includes("฿26,400.00"),
    recipient: bodyText.includes("จิณห์นิภา ประสาทเขตรการ"),
    reviewRequired: bodyText.includes("รอตรวจ") || bodyText.includes("review_required"),
    rawOcrVisible: bodyText.includes("วิณห์นิภา") || bodyText.includes("วิณหนิภา"),
    noGeminiQuotaError: !bodyText.includes("429") && !bodyText.includes("quota")
  };
  report.passed = Object.values(report.observed).every(Boolean) && errors.length === 0;
  await page.screenshot({ path: path.join(outDir, "ttb-26400.png"), fullPage: true });
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "ttb-26400-error.png"), fullPage: true }).catch(() => {});
} finally {
  report.errors = errors;
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await page.close();
  await context.close();
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
