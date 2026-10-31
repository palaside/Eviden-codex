import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3450/";
const outDir = path.resolve(root, process.env.E2E_OUT_DIR || path.join("For Test Results", "e2e-hybrid-layer-audit"));
const fixtures = (process.env.E2E_FIXTURE_FILES || "For Test\\แชทที่ 1\\V1- (117).jpg;For Test\\แชทที่ 1\\V1- (261).jpg")
  .split(";").map((file) => path.resolve(root, file.trim())).filter(Boolean);
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.E2E_EXECUTABLE_PATH ? { executablePath: process.env.E2E_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1662, height: 1548 } });
page.setDefaultTimeout(30_000);
const report = { schema: "digital-evidence.e2e-hybrid-layer-audit.v1", baseUrl, fixtures, errors: [], consoleErrors: [], pageErrors: [] };
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
page.on("pageerror", (error) => report.pageErrors.push(error.stack || error.message));

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#evidence-file-input").setInputFiles(fixtures);
  for (const fixture of fixtures) await page.getByText(path.basename(fixture), { exact: false }).first().waitFor({ state: "visible" });
  await page.getByRole("button", { name: /เริ่มประมวลผลพยานหลักฐาน/ }).click();
  await page.waitForFunction(() => !/กำลังประมวลผลแบบ Cross-Matching|กำลังสกัดพยานหลักฐานระดับพิกเซล/.test(document.body?.innerText || ""), undefined, { timeout: 180_000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /ดาวน์โหลด JSON Trace/ }).click();
  const download = await downloadPromise;
  const tracePath = path.join(outDir, "hybrid-trace.json");
  await download.saveAs(tracePath);
  const trace = JSON.parse(await fs.readFile(tracePath, "utf8"));
  const layerButton = page.locator("button").filter({ hasText: "ชั้นหลักฐาน OCR" });
  const layerButtonCount = await layerButton.count();
  if (layerButtonCount) {
    await layerButton.click({ force: true });
    await page.waitForTimeout(500);
  }
  const bodyText = await page.locator("body").innerText();
  const items = Array.isArray(trace.items) ? trace.items : [];
  const pages = items.flatMap((item) => Array.isArray(item.chatPages) ? item.chatPages : []);
  const layers = pages.map((pageItem) => ({
    schemaVersion: pageItem.schemaVersion,
    layer1: Array.isArray(pageItem.layer1) ? pageItem.layer1.length : 0,
    layer2: Array.isArray(pageItem.layer2) ? pageItem.layer2.length : 0,
    searchableOverlay: Array.isArray(pageItem.searchableTextOverlay) ? pageItem.searchableTextOverlay.length : 0,
    stitchSchema: pageItem.stitchAudit?.schemaVersion || null,
    sourceToStream: pageItem.stitchAudit?.sourceToStream?.length || 0,
    overlapEvidence: pageItem.stitchAudit?.overlapEvidence?.length || 0,
  }));
  const artifacts = [
    ...items.flatMap((item) => item.ocrDiagnosticTrace?.imageArtifacts || []),
    ...pages.flatMap((pageItem) => pageItem.ocrDiagnosticTrace?.imageArtifacts || []),
  ];
  report.result = {
    tracePath,
    itemCount: items.length,
    candidateCount: items.reduce((sum, item) => sum + (item.candidates?.length || 0), 0),
    layers,
    artifactCount: artifacts.length,
    artifactHashes: artifacts.filter((artifact) => typeof artifact.sha256 === "string" && artifact.sha256.length === 64).length,
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
    layerButtonCount,
    searchableOverlayVisible: bodyText.includes("Searchable text overlay"),
    stitchAuditVisible: bodyText.includes("Stitch audit"),
  };
  await fs.writeFile(path.join(outDir, "body.txt"), bodyText, "utf8");
  await page.screenshot({ path: path.join(outDir, "hybrid-final.png"), fullPage: true });
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack || error.message : String(error));
  await page.screenshot({ path: path.join(outDir, "hybrid-error.png"), fullPage: true }).catch(() => {});
} finally {
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
if (report.errors.length || report.consoleErrors.length || report.pageErrors.length) process.exitCode = 1;
