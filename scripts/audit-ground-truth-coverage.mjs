import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(process.argv[2] || process.cwd());
const inputDir = path.resolve(process.argv[3] || path.join(root, "For Test"));
const outputDir = path.resolve(process.argv[4] || path.join(root, "For Test Results", "ground-truth-coverage"));
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const rel = (file) => path.relative(root, file).replaceAll("\\", "/");

async function walk(dir) {
  const files = [];
  async function visit(current) {
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(full);
      else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
    }
  }
  await visit(dir);
  return files;
}

async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const stream = (await import("node:fs")).createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function readManifests() {
  const candidates = [
    path.join(root, "For Test Results", "verified-ground-truth-20261031", "manifest.json"),
    path.join(root, "For Test Results", "verified-retrain-25691031-054551", "dataset", "manifest.json"),
    path.join(root, "For Test Results", "retrain-evidence-supported-25691031-053416", "dataset", "manifest.json"),
  ];
  const entries = [];
  for (const file of candidates) {
    try {
      const data = JSON.parse(await fs.readFile(file, "utf8"));
      if (Array.isArray(data.images)) {
        for (const image of data.images) entries.push({ manifest: rel(file), ...image });
      }
      if (Array.isArray(data.boxes_pixel) && data.source_sha256) {
        entries.push({ manifest: rel(file), name: path.basename(data.created_from || "held-out"), sha256: data.source_sha256, boxes: data.boxes_pixel, label_source: data.verified_by, split: data.split });
      }
    } catch { /* missing or malformed manifests are reported below */ }
  }
  return entries;
}

async function main() {
  const files = await walk(inputDir);
  const manifestEntries = await readManifests();
  const manifestByHash = new Map();
  for (const entry of manifestEntries) {
    const hash = entry.sha256 || entry.source_sha256;
    if (!hash) continue;
    const prior = manifestByHash.get(hash) || [];
    prior.push(entry);
    manifestByHash.set(hash, prior);
  }

  const covered = [];
  const uncovered = [];
  const labelSourceCounts = {};
  for (const file of files) {
    const sha256 = await hashFile(file);
    const labels = manifestByHash.get(sha256) || [];
    const record = { file: rel(file), sha256, labels: labels.map(({ manifest, name, split, label_source, boxes, box }) => ({ manifest, name, split, label_source, box: box || null, boxCount: Array.isArray(boxes) ? boxes.length : (box ? 1 : 0) })) };
    if (labels.length) {
      covered.push(record);
      for (const label of labels) {
        const source = label.label_source || "unspecified";
        labelSourceCounts[source] = (labelSourceCounts[source] || 0) + 1;
      }
    } else uncovered.push(record);
  }

  const report = {
    schemaVersion: "digital-evidence.ground-truth-coverage.v1",
    generatedAt: new Date().toISOString(),
    inputDir: rel(inputDir),
    sourceInventory: { imageCount: files.length, uniqueSha256Count: new Set([...covered, ...uncovered].map((item) => item.sha256)).size },
    manifestInventory: { manifestEntryCount: manifestEntries.length, uniqueManifestSha256Count: manifestByHash.size, labelSourceCounts },
    coverage: { coveredImageCount: covered.length, uncoveredImageCount: uncovered.length, coverageRatio: files.length ? covered.length / files.length : 0 },
    covered,
    uncovered,
    limitations: [
      "การมี label ใน manifest ไม่ได้พิสูจน์ว่า OCR exact ทุก field",
      "retrain-evidence-supported ถูกเก็บเพื่อ inventory แต่ manifest ระบุว่า not_hand_drawn_ground_truth",
      "coverage นี้ตรวจด้วย SHA-256 และไม่เปลี่ยน label หรือ source image",
    ],
  };
  await fs.mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ report: rel(reportPath), sourceInventory: report.sourceInventory, manifestInventory: report.manifestInventory, coverage: report.coverage }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
