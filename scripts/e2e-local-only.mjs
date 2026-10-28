import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const fixture = path.resolve(root, process.env.E2E_FIXTURE || path.join("For Test", "แชทที่ 1", "V1- (117).jpg"));
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "matrix-chat-only"));
const expectNoSlip = process.env.E2E_EXPECT_NO_SLIP !== "0";
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const context = await browser.newContext({ viewport: { width: 1662, height: 1548 } });
const page = await context.newPage();
const apiResponses = [];
page.on("response", (response) => {
  if (response.url().includes("/api/")) apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
});

const report = { baseUrl, fixture, steps: [], assertions: {}, apiResponses };
try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3_000);
  report.steps.push({ name: "open", ok: true });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.waitForFunction((filename) => document.body?.innerText.includes(filename), path.basename(fixture), { timeout: 15_000 });
  report.steps.push({ name: "setInputFiles", ok: true });
  await page.screenshot({ path: path.join(outDir, "01-staged.png"), fullPage: true });

  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(
    () => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""),
    undefined,
    { timeout: 240_000 },
  );
  const bodyText = await page.locator("body").innerText();
  const noSlip = /สลิปที่ตรวจพบ 0 ใบ/.test(bodyText);
  report.steps.push({ name: "main-process", ok: true, bodyText });
  report.assertions = {
    inputVisible: bodyText.includes(path.basename(fixture)),
    noSlipCandidate: noSlip,
    expectedNoSlip: expectNoSlip,
    expectedOutcome: expectNoSlip ? noSlip : !noSlip,
    noExternalSlipExtractCalled: !apiResponses.some((item) => item.url.includes("/api/slips/extract")),
    apiCalls: apiResponses,
  };
  await page.screenshot({ path: path.join(outDir, "02-after-local-process.png"), fullPage: true });
  if (expectNoSlip ? !noSlip : noSlip) throw new Error(expectNoSlip ? "Chat-only ถูกยกเป็นสลิปโดย local process" : "Slip-only ไม่ถูกตรวจพบโดย local process");
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.apiResponses = apiResponses;
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await context.close();
  await browser.close();
}
console.log(JSON.stringify({ outDir, steps: report.steps.map(({ name, ok }) => ({ name, ok })), assertions: report.assertions, error: report.error || null }, null, 2));
