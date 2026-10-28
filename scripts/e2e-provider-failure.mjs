import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const fixture = path.resolve(root, process.env.E2E_FIXTURE || path.join("For Test", "แชทที่ 1", "V1- (261).jpg"));
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "provider-failure-e2e"));
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixture, steps: [], consoleErrors: [], apiCalls: [] };
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
page.on("response", (response) => {
  if (response.url().includes("/api/")) report.apiCalls.push({ url: response.url(), status: response.status(), method: response.request().method() });
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  report.steps.push({ name: "open", ok: true });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByText("V1- (261).jpg", { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
  report.steps.push({ name: "setInputFiles", ok: true });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), null, { timeout: 240_000 });
  report.steps.push({ name: "main-process", ok: true });

  await page.route("**/api/slips/extract", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "ผู้ให้บริการภายนอกไม่พร้อมใช้งาน", provider_status: 503, retryable: true }),
    });
  });
  await page.getByRole("button", { name: "Gemini", exact: true }).first().click();
  await page.getByText(/บริการภายนอกขัดข้องชั่วคราว ลองใหม่ได้/).waitFor({ state: "visible", timeout: 30_000 });
  const bodyText = await page.locator("body").innerText();
  const candidateCreated = /เพิ่ม candidate รอตรวจ/.test(bodyText);
  const retryShown = /บริการภายนอกขัดข้องชั่วคราว ลองใหม่ได้/.test(bodyText);
  const notConfirmed = /ยืนยันสลิป 0 รายการ/.test(bodyText);
  report.steps.push({ name: "provider-503", ok: retryShown && !candidateCreated && notConfirmed, retryShown, candidateCreated, notConfirmed });
  await page.screenshot({ path: path.join(outDir, "01-provider-503.png"), fullPage: true });
  report.assertions = { retryShown, candidateCreated, notConfirmed, consoleErrors: report.consoleErrors.length };
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
  console.log(JSON.stringify({ outDir, steps: report.steps, assertions: report.assertions || null, error: report.error || null }, null, 2));
}
