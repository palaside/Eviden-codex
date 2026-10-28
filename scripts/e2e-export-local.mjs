import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "export-local-e2e"));
const defaultFixtures = [
  path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (73).jpg"),
  path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (77).jpg"),
];
const fixtures = (process.env.E2E_FIXTURES
  ? process.env.E2E_FIXTURES.split("|").filter(Boolean).map((fixture) => path.resolve(root, fixture))
  : defaultFixtures);
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined,
});
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixtures, steps: [], downloads: [], apiResponses: [], apiErrorBodies: [], consoleErrors: [], pageErrors: [] };
const apiErrorBodyPromises = [];
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
page.on("pageerror", (error) => report.pageErrors.push(error.stack || error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/")) {
    report.apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method(), encrypted: response.headers()["x-digital-evidence-encrypted"] || null });
    if (response.status() >= 400) {
      apiErrorBodyPromises.push(response.text().then((body) => ({ url: response.url(), status: response.status(), body: body.slice(0, 2_000) })).catch((error) => ({ url: response.url(), status: response.status(), body: `UNREADABLE: ${error.message}` })));
    }
  }
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(1_000);
  await page.locator("#evidence-file-input").setInputFiles(fixtures);
  await page.waitForFunction((names) => names.every((name) => document.body?.innerText.includes(name)), fixtures.map((fixture) => path.basename(fixture)), { timeout: 30_000 });
  report.steps.push({ name: "upload", ok: true });

  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  await page.waitForFunction(
    () => /สลิปที่ตรวจพบ \d+ ใบ/.test(document.body?.innerText || "") || document.body?.innerText.includes("สกัดด้วย YOLO + Tesseract ไม่สำเร็จ"),
    undefined,
    { timeout: 60_000 },
  );
  report.steps.push({ name: "local-processing", ok: true });

  await page.getByPlaceholder(/รหัสเดียวสำหรับ PDF และ SFX/).fill("Enterprise-E2E-2026!");
  const pdfResponsePromise = page.waitForResponse((response) => response.url().includes("/api/export/encrypted-pdf"), { timeout: 300_000 });
  const pdfDownloadPromise = page.waitForEvent("download", { timeout: 300_000 }).catch(() => null);
  await page.locator("button").filter({ has: page.getByText("PDF", { exact: true }) }).last().click();
  const pdfResponse = await pdfResponsePromise;
  if (!pdfResponse.ok()) {
    throw new Error(`PDF export API ${pdfResponse.status()}: ${(await pdfResponse.text()).slice(0, 2_000)}`);
  }
  const pdfDownload = await pdfDownloadPromise;
  if (!pdfDownload) throw new Error("PDF export API succeeded but no download event was received");
  const pdfPath = path.join(outDir, "evidence-export.pdf");
  await pdfDownload.saveAs(pdfPath);
  const pdfStat = await fs.stat(pdfPath);
  report.downloads.push({ type: "PDF", path: pdfPath, suggestedFilename: pdfDownload.suggestedFilename(), size: pdfStat.size });
  report.steps.push({ name: "pdf-export", ok: pdfStat.size > 0 });

  const sfxResponsePromise = page.waitForResponse((response) => response.url().includes("/api/export/sfx"), { timeout: 300_000 });
  await page.locator("button").filter({ has: page.getByText("SFX", { exact: true }) }).last().click();
  await page.getByRole("button", { name: "สร้างและดาวน์โหลด SFX จริง", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const sfxDownloadPromise = page.waitForEvent("download", { timeout: 300_000 }).catch(() => null);
  await page.getByRole("button", { name: "สร้างและดาวน์โหลด SFX จริง", exact: true }).click();
  const sfxResponse = await sfxResponsePromise;
  if (!sfxResponse.ok()) {
    throw new Error(`SFX export API ${sfxResponse.status()}: ${(await sfxResponse.text()).slice(0, 2_000)}`);
  }
  const sfxDownload = await sfxDownloadPromise;
  if (!sfxDownload) throw new Error("SFX export API succeeded but no download event was received");
  const sfxPath = path.join(outDir, "evidence-export.exe");
  await sfxDownload.saveAs(sfxPath);
  const sfxStat = await fs.stat(sfxPath);
  report.downloads.push({ type: "SFX", path: sfxPath, suggestedFilename: sfxDownload.suggestedFilename(), size: sfxStat.size });
  report.steps.push({ name: "sfx-export", ok: sfxStat.size > 0 });
  await page.screenshot({ path: path.join(outDir, "01-after-exports.png"), fullPage: true });
  report.assertions = {
    pdfNonEmpty: pdfStat.size > 0,
    sfxNonEmpty: sfxStat.size > 0,
    pdfEncryptedHeader: report.apiResponses.some((item) => item.url.includes("/api/export/encrypted-pdf") && item.status === 200 && item.encrypted === "true"),
    sfxEncryptedHeader: report.apiResponses.some((item) => item.url.includes("/api/export/sfx") && item.status === 200 && item.encrypted === "true"),
    noProviderCall: !report.apiResponses.some((item) => item.url.includes("/api/slips/extract")),
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
  };
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  report.apiErrorBodies = await Promise.all(apiErrorBodyPromises);
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}

console.log(JSON.stringify({ outDir, steps: report.steps, downloads: report.downloads, assertions: report.assertions || null, error: report.error || null }, null, 2));
if (report.error || !report.assertions || Object.entries(report.assertions).some(([key, value]) => key !== "consoleErrors" && key !== "pageErrors" && value !== true) || report.assertions.consoleErrors > 0 || report.assertions.pageErrors > 0) process.exitCode = 1;
