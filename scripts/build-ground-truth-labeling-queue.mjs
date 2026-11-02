import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || process.cwd());
const coverageReport = path.resolve(process.argv[3] || path.join(root, "For Test Results", "ground-truth-coverage-20261102", "report.json"));
const outputFile = path.resolve(process.argv[4] || path.join(root, "For Test Results", "ground-truth-labeling-queue-20261102.json"));

const data = JSON.parse(await fs.readFile(coverageReport, "utf8"));
const uncovered = Array.isArray(data.uncovered) ? data.uncovered : [];
const folderCounts = {};
for (const item of uncovered) {
  const relative = item.file.replaceAll("\\", "/");
  const parts = relative.split("/");
  const group = parts[1] || "unknown";
  folderCounts[group] = (folderCounts[group] || 0) + 1;
}

const labelSpec = {
  reviewRequired: true,
  sourceOfTruth: "human_visual_review",
  objectClass: "slip",
  boxFormat: "pixel_xywh_on_original",
  negativeCases: ["no_slip", "money_text_without_slip"],
  requiredEvidence: ["original_sha256", "reviewer_id", "reviewed_at", "review_screenshot_or_note"],
  fieldGroundTruth: [
    "sender_name", "sender_account", "receiver_name", "receiver_account",
    "bank", "amount", "date", "time", "reference",
  ],
  fieldRule: "ถ้าอ่านจากภาพไม่ได้ให้บันทึก null และ review_required ห้ามเดา",
};

const queue = {
  schemaVersion: "digital-evidence.ground-truth-labeling-queue.v1",
  generatedAt: new Date().toISOString(),
  sourceCoverageReport: path.relative(root, coverageReport).replaceAll("\\", "/"),
  status: "pending_human_label",
  sourceInventory: data.sourceInventory,
  currentCoverage: data.coverage,
  folderCounts,
  labelSpec,
  priorityPlan: [
    { priority: 1, scope: "one/two-slip chat positives", target: "อย่างน้อย 10 ภาพต่อกลุ่ม" },
    { priority: 2, scope: "no-slip chat negatives", target: "อย่างน้อย 10 ภาพต่อกลุ่ม" },
    { priority: 3, scope: "money text without slip", target: "อย่างน้อย 10 ภาพ" },
    { priority: 4, scope: "multiple banks and image qualities", target: "ครอบคลุมทุกธนาคารที่พบจริง" },
  ],
  items: uncovered.map((item, index) => ({
    queueId: `GT-${String(index + 1).padStart(5, "0")}`,
    file: item.file,
    sha256: item.sha256,
    labelStatus: "pending_human_label",
    humanLabel: null,
  })),
};

await fs.writeFile(outputFile, JSON.stringify(queue, null, 2), "utf8");
console.log(JSON.stringify({ output: path.relative(root, outputFile).replaceAll("\\", "/"), status: queue.status, items: queue.items.length, folderCounts, labelSpec }, null, 2));
