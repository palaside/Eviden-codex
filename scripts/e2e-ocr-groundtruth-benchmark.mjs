import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || "For Test Results/enterprise-ocr-groundtruth-benchmark-3450");
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3450/";
const cases = [
  {
    id: "chat-3000",
    fixture: path.resolve(root, "For Test", "แชทที่ 3", "chatv3 (77).jpg"),
    expected: { amount: "฿3,000.00", recipient: "จิณห์นิภา ประสาทเขตรการ" },
  },
  {
    id: "ttb-10000",
    fixture: path.resolve(root, "For Test", "Done", "A4_IMG_ (3).JPEG"),
    expected: { amount: "฿10,000.00", recipient: "จิณห์นิภา ประสาทเขตรการ" },
  },
  {
    id: "ttb-26400",
    fixture: path.resolve(root, "For Test", "Done", "A4_IMG_ (1).JPEG"),
    expected: { amount: "฿26,400.00", recipient: "จิณห์นิภา ประสาทเขตรการ" },
  },
];
const requestedCaseIds = (process.env.E2E_CASE_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
const selectedCases = requestedCaseIds.length ? cases.filter((testCase) => requestedCaseIds.includes(testCase.id)) : cases;

await fs.mkdir(outDir, { recursive: true });
const browser = process.env.E2E_CDP_URL
  ? await chromium.connectOverCDP(process.env.E2E_CDP_URL)
  : await chromium.launch({
    headless: process.env.E2E_HEADLESS !== "false",
    executablePath: process.env.E2E_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--proxy-server=direct://", "--proxy-bypass-list=*"]
  });
const report = {
  schemaVersion: "digital-evidence.ocr-benchmark-limited-fields.v1",
  baseUrl,
  generatedAt: new Date().toISOString(),
  claimScope: "limited_expected_fields_only",
  exactFieldsMeasured: ["amount", "recipient"],
  fieldsNotMeasured: ["sender_name", "sender_account", "receiver_account", "bank", "date", "time", "reference", "qr_payload"],
  passedMeans: "upload/process/UI/JSON trace และ exact เฉพาะ amount กับ recipient ของ case ที่มี expected เท่านั้น; ไม่ใช่ exact ทุก field",
  cases: [],
  passed: false,
};

try {
  for (const testCase of selectedCases) {
    const context = await browser.newContext({ viewport: { width: 1662, height: 1548 } });
    const page = await context.newPage();
    const result = {
      id: testCase.id,
      fixture: testCase.fixture,
      expected: testCase.expected,
      expectedFields: Object.keys(testCase.expected),
      fieldsNotMeasured: report.fieldsNotMeasured,
      steps: [],
    };
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByText("PURE ZERO STATE", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
      await page.locator("#evidence-file-input").waitFor({ state: "attached", timeout: 60_000 });
      await page.waitForTimeout(500);
      await page.locator("#evidence-file-input").setInputFiles(testCase.fixture);
      await page.getByText(path.basename(testCase.fixture), { exact: true }).waitFor({ state: "visible", timeout: 180_000 });
      await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
      await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 300_000 });
      const bodyText = await page.locator("body").innerText();
      const observed = {
        source: bodyText.includes(path.basename(testCase.fixture)),
        amount: bodyText.includes(testCase.expected.amount),
        recipient: bodyText.includes(testCase.expected.recipient),
        reviewOnly: bodyText.includes("รอตรวจ") || bodyText.includes("รอตรวจจากภาพ"),
      };
      const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
      await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
      const download = await downloadPromise;
      const tracePath = path.join(outDir, `${testCase.id}-trace.json`);
      await download.saveAs(tracePath);
      const trace = JSON.parse(await fs.readFile(tracePath, "utf8"));
      const traceItems = Array.isArray(trace.items) ? trace.items : [];
      const traceCandidates = traceItems.flatMap((item) => Array.isArray(item.candidates) ? item.candidates : []);
      observed.jsonTrace = trace.schema === "digital-evidence.extraction-diagnostic-trace.v1";
      observed.sourceSha256 = traceItems.some((item) => typeof item.source?.sha256 === "string" && item.source.sha256.length === 64);
      observed.ocrAttempts = Number(trace.statistics?.ocrAttempts || 0) > 0;
      observed.ocrDiagnosticTrace = traceItems.some((item) => item.ocrDiagnosticTrace || traceCandidates.some((candidate) => candidate.ocrDiagnosticTrace));
      observed.reviewRequiredTrace = traceItems.some((item) => item.candidates?.some((candidate) => candidate.needsReview === true)) || trace.statistics?.candidatesNeedsReview > 0;
      result.observed = observed;
      result.passed = Object.values(observed).every(Boolean);
      result.steps.push({ name: "upload-process-ui-assertions", ok: result.passed });
      await page.screenshot({ path: path.join(outDir, `${testCase.id}.png`), fullPage: true });
    } catch (error) {
      result.passed = false;
      result.error = error instanceof Error ? error.stack || error.message : String(error);
      await page.screenshot({ path: path.join(outDir, `${testCase.id}-error.png`), fullPage: true }).catch(() => {});
    } finally {
      report.cases.push(result);
      await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
      await page.close();
      await context.close();
    }
  }
  report.passed = report.cases.length === selectedCases.length && selectedCases.length > 0 && report.cases.every((item) => item.passed);
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}

console.log(JSON.stringify({ outDir, cases: report.cases.length, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
