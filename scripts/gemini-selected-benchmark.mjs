import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:38772";
const limit = Number(process.env.GEMINI_BENCHMARK_LIMIT || 50);
const startIndex = Number(process.env.GEMINI_BENCHMARK_START || 0);
const outDir = path.resolve(root, process.env.GEMINI_BENCHMARK_OUT || "For Test Results/gemini-selected-benchmark");
const imageExt = /\.(?:jpg|jpeg|png|webp)$/i;
const folders = ["แชทที่ 1", "แชทที่ 2", "แชทที่ 3", "Done"];

async function listImages(folder) {
  const dir = path.join(root, "For Test", folder);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && imageExt.test(entry.name))
    .map((entry) => path.join(dir, entry.name));
}

function selectBalanced(groups, count) {
  const selected = [];
  const cursors = groups.map(() => 0);
  while (selected.length < count && cursors.some((cursor, index) => cursor < groups[index].length)) {
    for (let groupIndex = 0; groupIndex < groups.length && selected.length < count; groupIndex += 1) {
      const cursor = cursors[groupIndex];
      if (cursor >= groups[groupIndex].length) continue;
      selected.push(groups[groupIndex][cursor]);
      cursors[groupIndex] += 1;
    }
  }
  return selected;
}

async function runOne(filePath, index) {
  const started = Date.now();
  const bytes = await fs.readFile(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), path.basename(filePath));
  form.append("mode", "detect");
  try {
    const response = await fetch(`${baseUrl}/api/slips/extract`, { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    return {
      index,
      file: filePath,
      sha256,
      bytes: bytes.length,
      status: response.status,
      ok: response.ok && payload?.success === true,
      provider: payload?.provider || "Gemini",
      candidates: Array.isArray(payload?.candidates) ? payload.candidates.map((candidate) => ({
        bbox_1000: candidate.bbox_1000,
        visual_cues: candidate.visual_cues,
        bank: candidate.data?.bank?.name || null,
        amount: candidate.data?.transaction?.amount ?? null,
        receiver: candidate.data?.receiver?.name || null,
        receiverConfidence: candidate.data?.confidence?.receiver_name ?? 0,
        warnings: candidate.data?.warnings || [],
      })) : [],
      quotaExceeded: payload?.quota_exceeded === true,
      message: payload?.message || null,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return { index, file: filePath, sha256, bytes: bytes.length, status: 0, ok: false, candidates: [], message: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
  }
}

const groups = await Promise.all(folders.map(listImages));
const fixtures = selectBalanced(groups, limit);
const remainingFixtures = fixtures.slice(startIndex);
await fs.mkdir(outDir, { recursive: true });
const report = {
  schema: "digital-evidence.gemini-selected-benchmark.v1",
  baseUrl,
  requested: limit,
  selected: fixtures.length,
  startIndex,
  generatedAt: new Date().toISOString(),
  policy: "Gemini result is a review candidate only; no result is ground truth or confirmation",
  cases: [],
};

for (let index = 0; index < remainingFixtures.length; index += 1) {
  const result = await runOne(remainingFixtures[index], startIndex + index + 1);
  report.cases.push(result);
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (result.quotaExceeded) {
    report.stopped = {
      reason: "provider_quota_exceeded",
      atIndex: result.index,
      message: result.message,
    };
    await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    break;
  }
}

report.summary = {
  completed: report.cases.length,
  successfulResponses: report.cases.filter((item) => item.ok).length,
  imagesWithSlipCandidates: report.cases.filter((item) => item.candidates.length > 0).length,
  imagesWithoutSlipCandidates: report.cases.filter((item) => item.ok && item.candidates.length === 0).length,
  quotaExceeded: report.cases.some((item) => item.quotaExceeded),
  banksObserved: [...new Set(report.cases.flatMap((item) => item.candidates.map((candidate) => candidate.bank).filter(Boolean)))],
};
await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outDir, summary: report.summary }, null, 2));
