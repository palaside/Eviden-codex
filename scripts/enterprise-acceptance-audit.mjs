import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const resultsRoot = path.resolve(root, "For Test Results");
const outDir = path.join(resultsRoot, "enterprise-acceptance-audit-current");
await fs.mkdir(outDir, { recursive: true });

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

const matrix = await readJson("For Test Results/enterprise-local-matrix-3450/report.json");
const exportReportPath = "For Test Results/enterprise-export-e2e-3450-current/report.json";
const exportReport = await readJson(exportReportPath);
const xlsxReport = await readJson("For Test Results/enterprise-xlsx-e2e-3450-slip/report.json");
const review = await readJson("For Test Results/enterprise-review-state-e2e-3450/report.json");
const fields = await readJson("For Test Results/enterprise-slip-fields-3450/report.json");
const legal = await readJson("For Test Results/legal-signal-scan-e2e-3265-current/summary.json");
const fourCorners = await readJson("For Test Results/enterprise-fourcorners-e2e-3450/report.json");
const supervisorProcess = await readJson("For Test Results/enterprise-supervisor-process-3455/report.json");
const humanCorrection = await readJson("For Test Results/enterprise-ocr-human-correction-3450/report.json");
const ocrBenchmark = await readJson("For Test Results/enterprise-ocr-groundtruth-benchmark-3450/report.json");
const geminiOcr = await readJson("For Test Results/enterprise-gemini-ocr-26400-3450/report.json");
let windowsServiceInstalled = false;
try {
  const serviceCheck = await import("node:child_process");
  const result = serviceCheck.execFileSync("powershell", ["-NoProfile", "-Command", "if (Get-Service -Name 'digitalevidenceenterprise.exe' -ErrorAction SilentlyContinue) { 'true' } else { 'false' }"], { encoding: "utf8" });
  windowsServiceInstalled = result.trim() === "true";
} catch {
  windowsServiceInstalled = false;
}

let runtimeStatus = 0;
try {
  const response = await fetch("http://127.0.0.1:3450/", { signal: AbortSignal.timeout(10_000) });
  runtimeStatus = response.status;
} catch {
  runtimeStatus = 0;
}

const checks = {
  runtime_http_200: runtimeStatus === 200,
  chat_slip_matrix_6_of_6: matrix.total === 6 && matrix.passed === 6 && matrix.failed === 0,
  pdf_sfx_e2e: exportReport.steps?.every((step) => step.ok) && exportReport.assertions?.pdfEncryptedHeader && exportReport.assertions?.sfxEncryptedHeader,
  xlsx_13_columns_e2e: xlsxReport.steps?.every((step) => step.ok) && xlsxReport.download?.size > 0,
  review_state_persistence: review.passed === true,
  known_slip_field_assertions: fields.passed === true,
  legal_scan_complete: legal.scan_status === "complete" && legal.unique_completed === legal.unique_total && legal.remaining === 0,
  legal_scan_no_ocr_errors: legal.unique_images_ocr_error === 0,
  legal_review_only: legal.legal_decision === false,
  original_hash_inventory_complete: legal.image_files === legal.unique_images_completed + legal.exact_duplicate_files_skipped,
  fourcorners_quota_is_review_safe: fourCorners.passed === true
    && fourCorners.response?.http_status === 429
    && fourCorners.response?.retryable === false
    && fourCorners.response?.legal_decision === false,
  application_supervisor_restart_e2e: supervisorProcess.passed === true
    && supervisorProcess.steps?.every((step) => step.ok),
  windows_service_installed: windowsServiceInstalled,
  ocr_human_correction_e2e: humanCorrection.passed === true
    && humanCorrection.steps?.every((step) => step.ok),
  ocr_groundtruth_sample_complete: ocrBenchmark.cases?.length === 3
    && ocrBenchmark.cases.every((testCase) => testCase.passed === true),
  gemini_provider_e2e_review_only: geminiOcr.passed === true
    && geminiOcr.providerResponse?.httpStatus === 200
    && geminiOcr.providerResponse?.success === true
    && geminiOcr.ui?.reviewOnlyVisible === true,
  gemini_quota_failure_review_safe: geminiOcr.providerResponse?.httpStatus === 502
    && /429|quota|RESOURCE_EXHAUSTED/iu.test(geminiOcr.providerResponse?.message || "")
    && geminiOcr.ui?.reviewOnlyVisible === true,
  enterprise_build_present: await exists("build-output-enterprise/BUILD_ID"),
};

const blockers = [
  "FourCorners MCP citation รอบปัจจุบันยังไม่ได้พิสูจน์ เนื่องจาก quota ภายนอก",
  "ยังไม่มี OCR ground-truth benchmark ครบทุก field ของทั้ง 3,265 ไฟล์",
  "ยังมี lint warnings ที่ไม่ใช่ error",
];
if (!checks.windows_service_installed) {
  blockers.push("ยังไม่ได้ติดตั้งเป็น Windows Service จริง (application supervisor ผ่านแล้ว)");
}
if (!checks.ocr_human_correction_e2e) blockers.push("ยังไม่มีหลักฐาน E2E การแก้ไขชื่อโดยผู้ใช้และการคง provenance");
if (!checks.ocr_groundtruth_sample_complete) blockers.push("OCR ground-truth sample ยังไม่ผ่านครบทุก fixture");

const audit = {
  generated_at: new Date().toISOString(),
  source_of_truth: root,
  runtime: { url: "http://127.0.0.1:3450/", http_status: runtimeStatus },
  checks,
  passed_checks: Object.values(checks).filter(Boolean).length,
  total_checks: Object.keys(checks).length,
  core_e2e_passed: Object.entries(checks).filter(([key]) => key !== "enterprise_build_present").every(([, value]) => value),
  enterprise_ready: false,
  blockers,
  evidence: {
    matrix: "For Test Results/enterprise-local-matrix-3450/report.json",
    export: exportReportPath,
    xlsx: "For Test Results/enterprise-xlsx-e2e-3450-slip/report.json",
    review: "For Test Results/enterprise-review-state-e2e-3450/report.json",
    fields: "For Test Results/enterprise-slip-fields-3450/report.json",
    legal: "For Test Results/legal-signal-scan-e2e-3265-current/summary.json",
    fourCorners: "For Test Results/enterprise-fourcorners-e2e-3450/report.json",
    supervisor: "For Test Results/enterprise-supervisor-process-3455/report.json",
    humanCorrection: "For Test Results/enterprise-ocr-human-correction-3450/report.json",
    ocrBenchmark: "For Test Results/enterprise-ocr-groundtruth-benchmark-3450/report.json",
    geminiOcr: "For Test Results/enterprise-gemini-ocr-26400-3450/report.json",
    serviceInstall: "For Test Results/enterprise-service-install-20261028/report.json",
  },
};

await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(audit, null, 2), "utf8");
console.log(JSON.stringify({ outDir, passed_checks: audit.passed_checks, total_checks: audit.total_checks, core_e2e_passed: audit.core_e2e_passed, enterprise_ready: audit.enterprise_ready }, null, 2));
if (!audit.core_e2e_passed) process.exitCode = 1;
