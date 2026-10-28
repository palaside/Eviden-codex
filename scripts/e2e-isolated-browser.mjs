import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const fixture = path.resolve(root, process.env.E2E_FIXTURE || path.join("For Test", "แชทที่ 1", "V1- (261).jpg"));
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "isolated-browser-e2e"));

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1662, height: 1548 } });
const page = await context.newPage();
const consoleErrors = [];
const apiResponses = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", async (response) => {
  if (!response.url().includes("/api/")) return;
  const record = {
    url: response.url(),
    status: response.status(),
    method: response.request().method(),
    encrypted: response.headers()["x-digital-evidence-encrypted"] || null,
  };
  if (response.url().includes("/api/slips/")) {
    try { record.body = await response.json(); } catch { record.body = "<non-json>"; }
  }
  apiResponses.push(record);
});

const report = {
  baseUrl,
  fixture,
  steps: [],
  consoleErrors,
  apiResponses,
};

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  report.steps.push({ name: "open", ok: true, title: await page.title() });
  await page.screenshot({ path: path.join(outDir, "01-zero-state.png"), fullPage: true });

  await page.locator("#evidence-file-input").setInputFiles(fixture);
  await page.getByText("V1- (261).jpg", { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
  report.steps.push({ name: "setInputFiles", ok: true, queueText: await page.locator("body").innerText() });
  await page.screenshot({ path: path.join(outDir, "02-staged.png"), fullPage: true });

  const processButton = page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ });
  await processButton.click();
  await page.waitForFunction(
    () => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""),
    undefined,
    { timeout: 240_000 },
  );
  report.steps.push({ name: "main-process", ok: true, bodyText: await page.locator("body").innerText() });
  await page.screenshot({ path: path.join(outDir, "03-after-main-process.png"), fullPage: true });

  const geminiButton = page.getByRole("button", { name: "Gemini", exact: true }).first();
  await geminiButton.waitFor({ state: "visible", timeout: 15_000 });
  const apiCountBeforeGemini = apiResponses.length;
  const geminiResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/slips/extract") && response.request().method() === "POST",
    { timeout: 240_000 },
  );
  await geminiButton.click();
  await page.waitForFunction(
    () => !/กำลังสกัด/.test(document.body?.innerText || ""),
    undefined,
    { timeout: 240_000 },
  );
  const geminiResponse = await geminiResponsePromise;
  await page.waitForTimeout(1000);
  const geminiDone = geminiResponse.url().includes("/api/slips/extract");
  if (!geminiDone) throw new Error("Gemini scan จบแต่ไม่พบ /api/slips/extract");
  const afterGeminiText = await page.locator("body").innerText();
  const geminiCandidateVisible = /สลิปที่ตรวจพบ 2 ใบ|พบ 2 · ยืนยัน 0|฿1,400\.00|202504151902531655/.test(afterGeminiText);
  report.steps.push({
    name: "gemini-scan",
    ok: true,
    bodyText: afterGeminiText,
    apiResponses: apiResponses.slice(apiCountBeforeGemini),
  });
  await page.screenshot({ path: path.join(outDir, "04-after-gemini.png"), fullPage: true });

  if (geminiCandidateVisible) {
    const exportPassword = "Enterprise-E2E-2026!";
    await page.getByPlaceholder(/รหัสเดียวสำหรับ PDF และ SFX/).fill(exportPassword);
    const pdfDownloadPromise = page.waitForEvent("download", { timeout: 240_000 });
    await page.locator("button").filter({ has: page.getByText("PDF", { exact: true }) }).first().click();
    const pdfDownload = await pdfDownloadPromise;
    const pdfPath = path.join(outDir, "evidence-export.pdf");
    await pdfDownload.saveAs(pdfPath);
    report.steps.push({ name: "pdf-export", ok: true, encrypted: true, suggestedFilename: pdfDownload.suggestedFilename(), path: pdfPath });

    await page.locator("button").filter({ has: page.getByText("SFX", { exact: true }) }).first().click();
    const sfxDownloadPromise = page.waitForEvent("download", { timeout: 240_000 });
    await page.getByRole("button", { name: "สร้างและดาวน์โหลด SFX จริง", exact: true }).click();
    const sfxDownload = await sfxDownloadPromise;
    const sfxPath = path.join(outDir, "evidence-export.exe");
    await sfxDownload.saveAs(sfxPath);
    report.steps.push({ name: "sfx-export", ok: true, encrypted: true, suggestedFilename: sfxDownload.suggestedFilename(), path: sfxPath });
    await page.screenshot({ path: path.join(outDir, "05-after-exports.png"), fullPage: true });
  } else {
    report.steps.push({ name: "exports", ok: false, skipped: "Gemini candidate ไม่พร้อม จึงไม่สร้าง export เพื่อไม่ทดสอบด้วยข้อมูลว่าง" });
  }

  const bodyText = await page.locator("body").innerText();
  const buttonTexts = await page.getByRole("button").allTextContents();
  report.assertions = {
    hasInputFile: bodyText.includes("V1- (261).jpg"),
    hasCandidateOrSlipStatus: /candidate|สลิปที่ตรวจพบ|ตรวจพบ/.test(bodyText),
    geminiApiCalled: apiResponses.some((item) => item.url.includes("/api/slips/extract") && item.method === "POST"),
    geminiCandidateVisible,
    buttonTexts,
    apiCalls: apiResponses.map(({ url, status, method }) => ({ url, status, method })),
  };
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.consoleErrors = consoleErrors;
  report.apiResponses = apiResponses;
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({
  outDir,
  steps: report.steps.map(({ name, ok }) => ({ name, ok })),
  assertions: report.assertions || null,
  error: report.error || null,
}, null, 2));
