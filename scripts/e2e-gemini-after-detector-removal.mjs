import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:38772/";
const fixture = path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (77).jpg");
const outDir = path.resolve(root, "For Test Results", "e2e-after-detector-removal");
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
page.setDefaultTimeout(60_000);
const report = { schema: "digital-evidence.e2e-gemini-after-detector-removal.v1", baseUrl, fixture, passed: false, api: null, assertions: null };

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByText(path.basename(fixture), { exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/slips/extract") && response.request().method() === "POST", { timeout: 300_000 });
  await page.getByRole("button", { name: "Gemini", exact: true }).last().click();
  const response = await responsePromise;
  report.api = { status: response.status(), provider: "gemini", payload: await response.json() };
  await page.waitForFunction(() => /เพิ่ม candidate รอตรวจ|เติมเฉพาะช่องว่างในรายการเดิม|สกัดด้วย Gemini ไม่สำเร็จ/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  const body = await page.locator("body").innerText();
  report.assertions = {
    responseReceived: response.status() >= 200 && response.status() < 300,
    candidateOrExistingUpdated: body.includes("เพิ่ม candidate รอตรวจ") || body.includes("เติมเฉพาะช่องว่างในรายการเดิม"),
    reviewOnlyVisible: /รอตรวจ|ยังไม่ยืนยัน/u.test(body),
    noYoloButton: !(await page.getByRole("button", { name: "YOLO", exact: true }).count()),
    noConfirmedTransaction: !body.includes("ยืนยัน 1 / พบ 1"),
  };
  report.passed = Object.values(report.assertions).every(Boolean);
  await page.screenshot({ path: path.join(outDir, "gemini-e2e.png"), fullPage: true });
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "gemini-error.png"), fullPage: true }).catch(() => {});
} finally {
  await fs.writeFile(path.join(outDir, "gemini-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await page.close();
  await browser.close();
}
console.log(JSON.stringify({ ...report, api: report.api ? { status: report.api.status, provider: report.api.provider, providerStatus: report.api.payload?.metadata?.provider_status, message: report.api.payload?.message } : null }, null, 2));
if (!report.passed) process.exitCode = 1;
