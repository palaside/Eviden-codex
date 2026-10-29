import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3451/";
const fixture = path.resolve(root, "For Test", "Done", "A4_IMG_ (1).JPEG");
const outDir = path.resolve(root, "For Test Results", "enterprise-yolo-26400-3451");
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixture, passed: false };

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByText(path.basename(fixture), { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  const yoloResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/slips/yolo"), { timeout: 300_000 });
  await page.getByRole("button", { name: "YOLO", exact: true }).last().click();
  const yoloResponse = await yoloResponsePromise;
  report.providerResponse = { status: yoloResponse.status(), payload: await yoloResponse.json() };
  await page.waitForFunction(() => /เพิ่ม candidate รอตรวจ|เติมเฉพาะช่องว่างในรายการเดิม|สกัดด้วย YOLO \+ Tesseract ไม่สำเร็จ/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  const body = await page.locator("body").innerText();
  report.assertions = {
    amountVisible: body.includes("฿26,400.00"),
    exactRecipientVisible: body.includes("จิณห์นิภา ประสาทเขตรการ"),
    reviewOnlyVisible: /รอตรวจ|ยังไม่ยืนยัน/u.test(body),
    noConfirmedTransaction: !body.includes("ยืนยัน 1 / พบ 1"),
  };
  report.passed = Object.values(report.assertions).every(Boolean);
  await page.screenshot({ path: path.join(outDir, "ttb-26400-yolo.png"), fullPage: true });
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await page.close();
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
