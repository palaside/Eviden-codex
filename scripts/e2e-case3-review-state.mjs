import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const appUrl = process.env.CASE3_APP_URL || "http://localhost:3475/";
const outputPath = process.env.CASE3_REPORT_PATH || path.resolve("test-results/case3-review-state-e2e.json");
const settleBeforeReloadMs = Number(process.env.CASE3_SETTLE_BEFORE_RELOAD_MS || "0");
const playwrightPath = process.env.PLAYWRIGHT_ENTRY
  || "C:/Users/EVE/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext();
let page = await context.newPage();
const report = { appUrl, steps: [], passed: false };

function step(name, detail) {
  report.steps.push({ name, ...detail });
}

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("digital-evidence-local", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("workspace")) request.result.createObjectStore("workspace");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const fileBytes = new Uint8Array([1, 2, 3]).buffer;
        const candidate = {
          id: "case3-ttb-7200",
          extractionVersion: 10,
          sourceItemId: "case3-chat",
          sourceFileName: "ttb-7200-fixture.png",
          sourceSha256: "case3-fixture-sha256",
          chatPageNumber: 1,
          chatPageCount: 1,
          dossierPageNumber: 4,
          isDuplicate: false,
          isConfirmed: false,
          needsReview: true,
          cropDataUrl: "data:image/png;base64,iVBORw0KGgo=",
          data: {
            bank: { name: "ttb" },
            sender: { name: "ผู้โอน ร***", account_no: "XXX-X-XX526-6", bank: "ttb" },
            receiver: { name: "จิณห์นิภา ประสาทเขตรการ", account_no: "XXX-X-XX996-5", bank: "ttb" },
            transaction: { amount: 7200, reference_no: "202506171502627774", date: "17 มิ.ย. 2568", time: "15:51" },
            confidence: { receiver_name: 0.7 },
            warnings: ["OCR ตรวจชื่อผู้รับซ้ำแล้วได้ผลต่างกัน ต้องตรวจจากภาพต้นฉบับ"],
            raw_text: ["fixture OCR trace"],
          },
        };
        const snapshot = {
          version: 1,
          savedAt: new Date().toISOString(),
          manifestList: [],
          stagedQueue: [{
            id: "case3-chat",
            extractionVersion: 10,
            fileBytes,
            fileName: "ttb-7200-fixture.png",
            fileType: "image/png",
            fileLastModified: 0,
            category: "CHAT",
            status: "done",
            embeddedSlips: [candidate],
          }],
        };
        const transaction = database.transaction("workspace", "readwrite");
        transaction.objectStore("workspace").put(snapshot, "processed-evidence-queue");
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    });
  });
  step("seed", { candidate: "7200 unresolved OCR conflict", storedCandidateCount: 1 });

  // Stop the initial app instance before reopening so its empty initial state
  // cannot race the fixture write and overwrite IndexedDB.
  await page.close();
  page = await context.newPage();
  await page.goto(appUrl, { waitUntil: "networkidle" });
  const restoredSnapshot = await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open("digital-evidence-local", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction("workspace", "readonly").objectStore("workspace").get("processed-evidence-queue");
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => {
        database.close();
        const first = read.result?.stagedQueue?.[0];
        resolve({
          candidateCount: first?.embeddedSlips?.length ?? 0,
          version: read.result?.version,
          category: first?.category,
          status: first?.status,
          extractionVersion: first?.extractionVersion,
          fileBytesIsArrayBuffer: first?.fileBytes instanceof ArrayBuffer,
          candidateExtractionVersion: first?.embeddedSlips?.[0]?.extractionVersion,
        });
      };
    };
  }));
  step("restore-check", restoredSnapshot);
  await page.getByText("OCR ชื่อผู้รับยังไม่ตรงกัน · ต้องตรวจจากภาพ").waitFor();
  await page.getByText("฿7,200.00").first().waitFor();
  step("loaded", { conflictVisible: true, amountVisible: true });

  await page.getByRole("button", { name: /ตารางสรุปหลักฐาน/ }).click();
  const receiver = page.getByLabel("ชื่อผู้รับรายการ 1");
  await receiver.fill("น.ส. จิณห์นิภา ประสาทเขตรการ");
  await page.getByText("แก้ชื่อจากข้อเสนอแล้ว · ผล OCR เดิมยังขัดแย้ง · รอตรวจยืนยัน").waitFor();
  step("reviewed", { reviewStateVisible: true });

  await page.getByRole("button", { name: "ยืนยันรายการ" }).click();
  await page.getByText("ผู้ใช้ยืนยัน").last().waitFor();
  step("confirmed", { confirmedVisible: true });

  await page.waitForTimeout(settleBeforeReloadMs);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("ยืนยัน 1 / พบ 1").waitFor();
  const staleReviewText = await page.getByText("แก้ชื่อจากข้อเสนอแล้ว · ผล OCR เดิมยังขัดแย้ง · รอตรวจยืนยัน").count();
  const persistentConflictText = await page.getByText("ผล OCR เดิมยังขัดแย้ง").count();
  step("reloaded", { confirmedVisible: true, staleReviewText, persistentConflictText });
  assert.equal(staleReviewText, 0, "confirmed record must not remain labelled as waiting for confirmation after reload");
  assert.ok(persistentConflictText > 0, "OCR conflict provenance must remain visible after a user review");
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  report.bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 12000);
} finally {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}

if (!report.passed) process.exitCode = 1;
