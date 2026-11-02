import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || process.cwd());
const outputDir = path.resolve(process.argv[3] || path.join(root, "For Test Results", "batch500-authoritative-aggregate"));
const workerDirs = [0, 100, 200, 300, 400].map((offset) =>
  path.join(root, "For Test Results", `e2e-service-3450-batch500-20261028-worker-${offset}-final`),
);
const scalarFields = [
  "processed", "failed", "candidatesDetected", "traceCandidates", "amountPresent", "referencePresent",
  "senderNamePresent", "receiverNamePresent", "needsReview", "sourceSha256Present", "sourcePagePresent",
  "providerCalls", "consoleErrorCases", "pageErrorCases",
];

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const workers = [];
  for (const dir of workerDirs) {
    const reportPath = path.join(dir, "report.json");
    const report = await readJson(reportPath);
    workers.push({
      path: path.relative(root, reportPath).replaceAll("\\", "/"),
      requestedLimit: report.requestedLimit,
      processed: report.processed,
      failed: report.failed,
      report,
    });
  }

  const totals = Object.fromEntries(scalarFields.map((field) => [field, workers.reduce((sum, item) => sum + Number(item.report[field] || 0), 0)]));
  const invariants = {
    workerCount: workers.length === 5,
    eachWorkerRequested100: workers.every((item) => item.requestedLimit === 100),
    eachWorkerProcessed100: workers.every((item) => item.processed === 100),
    eachWorkerFailed0: workers.every((item) => item.failed === 0),
    processed500: totals.processed === 500,
    failed0: totals.failed === 0,
    providerCalls0: totals.providerCalls === 0,
    consoleErrors0: totals.consoleErrorCases === 0,
    pageErrors0: totals.pageErrorCases === 0,
  };
  const processingProof = Object.values(invariants).every(Boolean);
  const report = {
    schemaVersion: "digital-evidence.batch500-authoritative.v1",
    generatedAt: new Date().toISOString(),
    baseUrl: workers[0]?.report.baseUrl || null,
    scope: {
      input: "five final worker reports, 100 items each",
      excluded: ["partial reports", "sandbox ERR_NETWORK_ACCESS_DENIED run", "interrupted elevated run"],
    },
    workers: workers.map(({ path: workerPath, requestedLimit, processed, failed }) => ({ workerPath, requestedLimit, processed, failed })),
    totals,
    invariants,
    processingProof,
    limitations: [
      "พิสูจน์การประมวลผล/trace/review flow ไม่ใช่การพิสูจน์ OCR exact ทุก field",
      "ไม่มี ground truth ครบ 500 ภาพ จึงคำนวณ exact accuracy ของชื่อ/บัญชี/วันที่/เวลาไม่ได้",
      "needsReview ถูกเก็บตามผลจริงและไม่ถูกเปลี่ยนเป็น confirmed",
    ],
  };
  await fs.mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ report: path.relative(root, reportPath).replaceAll("\\", "/"), processingProof, totals, invariants }, null, 2));
  if (!processingProof) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
