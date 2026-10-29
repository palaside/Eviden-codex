import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const appUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const fixture = path.resolve(root, "For Test", "Done", "A4_IMG_ (1).JPEG");
const correctedRecipient = "น.ส. จิณห์นิภา ประสาทเขตรการ";
const outDir = path.resolve(root, "For Test Results", "enterprise-ocr-human-correction-3450");
const report = { appUrl, fixture, correctedRecipient, steps: [], passed: false };

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined,
});
const context = await browser.newContext({ viewport: { width: 1662, height: 1548 } });
const page = await context.newPage();

function step(name, detail) {
  report.steps.push({ name, ...detail });
}

try {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByText(path.basename(fixture), { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  step("upload", { ok: true });

  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(
    () => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""),
    undefined,
    { timeout: 300_000 },
  );
  const before = await page.locator("body").innerText();
  assert.match(before, /฿26,400\.00/u);
  assert.match(before, /รอตรวจ/u);
  step("ocr-result-kept-review-only", { ok: true, amountVisible: true, reviewOnlyVisible: true });

  await page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ }).click();
  const receiver = page.getByLabel("ชื่อผู้รับรายการ 1");
  await receiver.fill(correctedRecipient);
  const afterEditValue = await receiver.inputValue();
  await page.getByText("กรอก/แก้ไขแล้ว · รอตรวจ", { exact: true }).waitFor();
  step("user-correction-recorded-separately", { ok: true, reviewStateVisible: true, afterEditValue, ocrConflictCoverage: "case3-review-state" });

  await page.getByRole("button", { name: "ยืนยันรายการ" }).click();
  await page.getByText("ผู้ใช้ยืนยัน").last().waitFor();
  step("user-confirmed", { ok: true, confirmedVisible: true });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("ยืนยัน 1 / พบ 1").waitFor();
  const after = await page.locator("body").innerText();
  await page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ }).click();
  const afterReloadValue = await page.getByLabel("ชื่อผู้รับรายการ 1").inputValue();
  step("persisted-value-observed", { afterReloadValue });
  assert.match(after, /ผู้ใช้แก้\/กรอกชื่อและยืนยันแล้ว/u);
  assert.equal(afterReloadValue, correctedRecipient);
  assert.doesNotMatch(after, /กรอก\/แก้ไขแล้ว · รอตรวจ/u);
  step("reload-preserves-confirmation-and-correction", { ok: true, confirmationVisible: true, correctedValueVisible: true });
  await page.screenshot({ path: path.join(outDir, "ttb-26400-human-correction.png"), fullPage: true });
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
} finally {
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await page.close();
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({ outDir, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
