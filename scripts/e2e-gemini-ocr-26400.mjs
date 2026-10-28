import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const appUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const fixture = path.resolve(root, "For Test", "Done", "A4_IMG_ (1).JPEG");
const outDir = path.resolve(root, "For Test Results", "enterprise-gemini-ocr-26400-3450");
const report = { appUrl, fixture, provider: "Gemini", steps: [], passed: false };

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined });
const context = await browser.newContext({ viewport: { width: 1662, height: 1548 } });
const page = await context.newPage();

try {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByText(path.basename(fixture), { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  report.steps.push({ name: "local-process", ok: true });

  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/slips/extract"), { timeout: 300_000 });
  await page.getByRole("button", { name: "Gemini", exact: true }).last().click();
  const response = await responsePromise;
  const payload = await response.json();
  await page.waitForTimeout(2_000);
  const bodyText = await page.locator("body").innerText();
  report.providerResponse = {
    httpStatus: response.status(),
    success: payload.success,
    message: payload.message,
    metadata: payload.metadata,
    candidates: payload.candidates?.map((candidate) => ({ data: candidate.data, visual_cues: candidate.visual_cues, bbox_1000: candidate.bbox_1000 })),
  };
  const detectionBox = payload.candidates?.[0]?.bbox_1000;
  if (Array.isArray(detectionBox)) {
    report.cropProviderResponse = await page.locator("#evidence-file-input").evaluate(async (input, bbox) => {
      const file = input.files?.[0];
      if (!file) throw new Error("ไม่มีไฟล์ใน input สำหรับ crop provider test");
      const bitmap = await createImageBitmap(file);
      const [top, left, bottom, right] = bbox;
      const crop = document.createElement("canvas");
      crop.width = Math.max(1, Math.round((right - left) * bitmap.width / 1000));
      crop.height = Math.max(1, Math.round((bottom - top) * bitmap.height / 1000));
      crop.getContext("2d").drawImage(bitmap,
        Math.round(left * bitmap.width / 1000), Math.round(top * bitmap.height / 1000), crop.width, crop.height,
        0, 0, crop.width, crop.height);
      bitmap.close();
      const blob = await new Promise((resolve) => crop.toBlob(resolve, "image/png"));
      const body = new FormData();
      body.append("file", new File([blob], "gemini-slip-crop.png", { type: "image/png" }));
      const response = await fetch("/api/slips/extract", { method: "POST", body, cache: "no-store" });
      return { httpStatus: response.status, body: await response.json() };
    }, detectionBox);
  }
  report.ui = {
    amountVisible: bodyText.includes("฿26,400.00"),
    reviewOnlyVisible: /รอตรวจ|ยังไม่ยืนยัน/u.test(bodyText),
    rawBodyExcerpt: bodyText.slice(-8000),
  };
  report.steps.push({ name: "provider-call-and-ui-propagation", ok: response.ok() && payload.success === true });
  await page.screenshot({ path: path.join(outDir, "ttb-26400-gemini.png"), fullPage: true });
  report.passed = response.ok() && payload.success === true;
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
} finally {
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await page.close();
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({ outDir, passed: report.passed, providerStatus: report.providerResponse?.httpStatus }, null, 2));
if (!report.passed) process.exitCode = 1;
