import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || "For Test Results/enterprise-ocr-groundtruth-benchmark-3450");
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3450/";
const cases = [
  {
    id: "chat-3000",
    fixture: path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (77).jpg"),
    expected: { amount: "฿3,000.00", recipient: "จิณห์นิภา ประสาทเขตรการ" },
  },
  {
    id: "ttb-10000",
    fixture: path.resolve(root, "For Test", "Done", "A4_IMG_ (3).JPEG"),
    expected: { amount: "฿10,000.00", recipient: "จิณห์นิภา ประสาทเขตรการ" },
  },
  {
    id: "ttb-26400",
    fixture: path.resolve(root, "For Test", "Done", "A4_IMG_ (1).JPEG"),
    expected: { amount: "฿26,400.00", recipient: "จิณห์นิภา ประสาทเขตรการ" },
  },
];
const requestedCaseIds = (process.env.E2E_CASE_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
const selectedCases = requestedCaseIds.length ? cases.filter((testCase) => requestedCaseIds.includes(testCase.id)) : cases;

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const report = { baseUrl, generatedAt: new Date().toISOString(), cases: [], passed: false };

try {
  for (const testCase of selectedCases) {
    const context = await browser.newContext({ viewport: { width: 1662, height: 1548 } });
    const page = await context.newPage();
    const result = { id: testCase.id, fixture: testCase.fixture, expected: testCase.expected, steps: [] };
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
      await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 60_000 });
      await page.waitForTimeout(500);
      await page.locator("#evidence-file-input").setInputFiles(testCase.fixture);
      await page.getByText(path.basename(testCase.fixture), { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
      await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
      await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
      const bodyText = await page.locator("body").innerText();
      const observed = {
        source: bodyText.includes(path.basename(testCase.fixture)),
        amount: bodyText.includes(testCase.expected.amount),
        recipient: bodyText.includes(testCase.expected.recipient),
        reviewOnly: bodyText.includes("รอตรวจ") || bodyText.includes("รอตรวจจากภาพ"),
      };
      result.observed = observed;
      result.passed = Object.values(observed).every(Boolean);
      result.steps.push({ name: "upload-process-ui-assertions", ok: result.passed });
      await page.screenshot({ path: path.join(outDir, `${testCase.id}.png`), fullPage: true });
    } catch (error) {
      result.passed = false;
      result.error = error instanceof Error ? error.stack || error.message : String(error);
      await page.screenshot({ path: path.join(outDir, `${testCase.id}-error.png`), fullPage: true }).catch(() => {});
    } finally {
      report.cases.push(result);
      await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
      await page.close();
      await context.close();
    }
  }
  report.passed = report.cases.length === selectedCases.length && selectedCases.length > 0 && report.cases.every((item) => item.passed);
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}

console.log(JSON.stringify({ outDir, cases: report.cases.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
