import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "hybrid-local-e2e"));
const fixtures = [
  path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (73).jpg"),
  path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (77).jpg"),
];
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
const report = { baseUrl, fixtures, steps: [], apiResponses: [], consoleErrors: [], pageErrors: [] };
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
page.on("pageerror", (error) => report.pageErrors.push(error.stack || error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/")) report.apiResponses.push({ url: response.url(), status: response.status(), method: response.request().method() });
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(1_000);
  await page.locator("#evidence-file-input").setInputFiles(fixtures);
  await page.getByText("chatv3 (73).jpg", { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("chatv3 (77).jpg", { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
  report.steps.push({ name: "upload-two-chat-images", ok: true });
  await page.screenshot({ path: path.join(outDir, "01-uploaded.png"), fullPage: true });

  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
  report.steps.push({ name: "main-process", ok: true });
  await page.waitForFunction(() => document.body?.innerText.includes("เพิ่ม candidate รอตรวจ") || document.body?.innerText.includes("สกัดด้วย YOLO + Tesseract ไม่สำเร็จ"), undefined, { timeout: 300_000 });
  const bodyText = await page.locator("body").innerText();
  report.steps.push({ name: "auto-yolo-local", ok: bodyText.includes("เพิ่ม candidate รอตรวจ") });
  await page.screenshot({ path: path.join(outDir, "02-after-local-yolo.png"), fullPage: true });

  const traceDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
  const trace = await traceDownloadPromise;
  await trace.saveAs(path.join(outDir, "local-process-trace.json"));
  report.steps.push({ name: "download-trace", ok: true });
  await page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ }).click();
  await page.getByText("ตารางสรุปรายการทางการเงินที่ตรวจพบ", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path: path.join(outDir, "03-ledger-table.png"), fullPage: true });
  report.steps.push({ name: "open-ledger-table", ok: true });
  const refreshedBody = await page.locator("body").innerText();
  const candidateCount = Number(refreshedBody.match(/สลิปที่ตรวจพบ (\d+) ใบ/)?.[1] || 0);
  report.assertions = {
    inputFiles: fixtures.every((file) => refreshedBody.includes(path.basename(file))),
    candidateCount,
    twoDistinctCandidates: candidateCount === 2,
    amount3000: /3,000\.00/.test(refreshedBody),
    amount7200: /7,200\.00/.test(refreshedBody),
    receiverNameVisible: /จิณห์นิภา|ประสาทเขตรการ/.test(refreshedBody),
    transactionTimeVisible: /15:51/.test(refreshedBody),
    noExternalProviderCall: !report.apiResponses.some((item) => item.url.includes("/api/slips/extract")),
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
  };
  await fs.writeFile(path.join(outDir, "ui-body.txt"), refreshedBody, "utf8");
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}

console.log(JSON.stringify({ outDir, steps: report.steps, assertions: report.assertions || null, error: report.error || null }, null, 2));
if (report.error || !report.assertions || !report.assertions.twoDistinctCandidates || !report.assertions.receiverNameVisible || !report.assertions.transactionTimeVisible) process.exitCode = 1;
