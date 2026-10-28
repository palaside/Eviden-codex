import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "production-local-matrix"));
const fixtures = [
  { file: path.join("For Test", "แชทที่ 1", "V1- (117).jpg"), expected: "chat-only" },
  { file: path.join("For Test", "แชทที่ 1", "V1- (100).jpg"), expected: "chat-only" },
  { file: path.join("For Test", "แชทที่ 1", "V1- (108).jpg"), expected: "chat-only" },
  { file: path.join("For Test", "แชทที่ 2", "chat2 (1).jpg"), expected: "chat-only" },
  { file: path.join("For Test", "แชทที่ 3", "chatv3 (100).jpg"), expected: "chat-only" },
  { file: path.join("For Test", "Done", "A4_IMG_ (1).PNG"), expected: "slip-only" },
].map((item) => ({ ...item, file: path.resolve(root, item.file) }));

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const [index, fixture] of fixtures.entries()) {
  const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
  const result = { fixture: fixture.file, expected: fixture.expected, steps: [], apiResponses: [] };
  page.on("response", (response) => {
    if (response.url().includes("/api/")) result.apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
  });
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    result.steps.push({ name: "open", ok: true });
    await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await page.locator("#evidence-file-input").setInputFiles(fixture.file);
    await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).waitFor({ state: "visible", timeout: 30_000 });
    result.steps.push({ name: "setInputFiles", ok: true });
    await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
    await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 240_000 });
    const bodyText = await page.locator("body").innerText();
    const detected = Number(bodyText.match(/สลิปที่ตรวจพบ (\d+) ใบ/)?.[1] || 0);
    const expectedPass = fixture.expected === "slip-only" ? detected > 0 : detected === 0;
    result.steps.push({ name: "main-process", ok: expectedPass, detectedSlipCount: detected });
    result.assertions = { inputVisible: bodyText.includes(path.basename(fixture.file)), detectedSlipCount: detected, expected: fixture.expected, expectedPass, noExternalCall: !result.apiResponses.some((item) => item.url.includes("/api/slips/extract")) };
    await page.screenshot({ path: path.join(outDir, `${String(index + 1).padStart(2, "0")}-${path.parse(fixture.file).name.replace(/[^a-zA-Z0-9_-]+/g, "_")}.png`), fullPage: true });
    if (!expectedPass) throw new Error(`ผลตรวจสลิปไม่ตรง expected=${fixture.expected}, detected=${detected}`);
  } catch (error) {
    result.error = error instanceof Error ? error.stack || error.message : String(error);
  } finally {
    results.push(result);
    await page.close();
  }
}

await browser.close();
const report = { baseUrl, total: results.length, passed: results.filter((result) => result.steps.at(-1)?.ok && !result.error).length, failed: results.filter((result) => result.error || !result.steps.at(-1)?.ok).length, results };
await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ outDir, total: report.total, passed: report.passed, failed: report.failed }, null, 2));
if (report.failed > 0) process.exitCode = 1;
