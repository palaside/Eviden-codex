import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.resolve(root, "For Test Results", "enterprise-slip-fields-3450");
const fixture = path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (77).jpg");
const expected = {
  detectedSlipText: "สลิปที่ตรวจพบ 1 ใบ",
  amountText: "฿3,000.00",
  recipientText: "จิณห์นิภา ประสาทเขตรการ",
  sourceText: "chatv3 (77).jpg",
};
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl: "http://127.0.0.1:3450/", fixture, expected, steps: [] };
try {
  await page.goto(report.baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  const bodyText = await page.locator("body").innerText();
  report.steps.push({ name: "open-upload-process", ok: true });
  report.observed = {
    detectedSlip: bodyText.includes(expected.detectedSlipText),
    amount: bodyText.includes(expected.amountText),
    recipient: bodyText.includes(expected.recipientText),
    source: bodyText.includes(expected.sourceText),
    reviewOnly: bodyText.includes("รอตรวจ") || bodyText.includes("รอตรวจจากภาพ"),
  };
  report.passed = Object.values(report.observed).every(Boolean);
  await page.screenshot({ path: path.join(outDir, "01-slip-fields.png"), fullPage: true });
  if (!report.passed) throw new Error(`Slip field assertion failed: ${JSON.stringify(report.observed)}`);
} catch (error) {
  report.passed = false;
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await page.close();
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
