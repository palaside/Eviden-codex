import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3450/";
const fixture = path.resolve(root, "For Test", "Done", "A4_IMG_ (1).JPEG");
const replayPath = process.env.E2E_GEMINI_REPLAY || path.join(process.env.TEMP || ".", "gemini-approved-final.json");
const outDir = path.resolve(root, "For Test Results", "enterprise-gemini-ui-replay-3450");
await fs.mkdir(outDir, { recursive: true });
const providerPayload = JSON.parse(await fs.readFile(replayPath, "utf8"));
// The approved provider replay was captured from the normal extraction API
// ({ success, data, metadata }). The Gemini button uses detect mode, whose
// contract is ({ success, candidates, metadata }). Convert only at the test
// boundary so the replay exercises the same API-to-UI contract as production.
const detectPayload = providerPayload?.candidates
  ? providerPayload
  : {
      success: providerPayload?.success === true,
      candidates: providerPayload?.success && providerPayload?.data
        ? [{
            bbox_1000: [0, 0, 1000, 1000],
            visual_cues: ["ผล provider จริงจากการทดสอบที่ได้รับอนุมัติ"],
            data: providerPayload.data,
          }]
        : [],
      metadata: providerPayload?.metadata,
      ...(providerPayload?.message ? { message: providerPayload.message } : {}),
    };
const browser = await chromium.launch({ executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixture, replayPath, externalCalls: 0, replayedProviderCalls: 0, passed: false };
let replayGeminiRequest = false;

try {
  await page.route("**/api/slips/extract", async (route) => {
    report.externalCalls += 1;
    if (!replayGeminiRequest) {
      await route.continue();
      return;
    }
    report.replayedProviderCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detectPayload) });
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.waitForFunction((name) => document.body?.innerText.includes(name), path.basename(fixture), { timeout: 30_000 });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  replayGeminiRequest = true;
  await page.getByRole("button", { name: "Gemini", exact: true }).last().click();
  await page.waitForFunction(() => /เพิ่ม candidate รอตรวจ|เติมเฉพาะช่องว่างในรายการเดิม|สกัดด้วย Gemini ไม่สำเร็จ/.test(document.body?.innerText || ""), undefined, { timeout: 60_000 });
  const body = await page.locator("body").innerText();
  report.assertions = {
    amountVisible: body.includes("฿26,400.00"),
    providerCandidateVisible: /เพิ่ม candidate รอตรวจ|เติมเฉพาะช่องว่างในรายการเดิม/u.test(body),
    reviewOnlyVisible: /รอตรวจ|ยังไม่ยืนยัน/u.test(body),
    noConfirmedTransaction: !body.includes("ยืนยัน 1 / พบ 1"),
    providerRequestsReplayed: report.replayedProviderCalls,
  };
  report.passed = Object.values(report.assertions).every((value) => value === true || value > 0);
  await page.screenshot({ path: path.join(outDir, "gemini-ui-replay.png"), fullPage: true });
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
