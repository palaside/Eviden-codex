import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker } from "../_workspaces/phase7-header-20261003/digital-evidence/node_modules/tesseract.js/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../For Test");
const appRoot = path.resolve(root, "../_workspaces/phase7-header-20261003/digital-evidence");
const outPath = process.argv[2] || path.join(appRoot, "test-results", "full-pipeline-ocr-trace.jsonl");
const fileListPath = process.env.OCR_FILE_LIST ? path.resolve(process.env.OCR_FILE_LIST) : null;
const concurrency = Number(process.env.OCR_WORKERS || 6);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const userTemp = path.join(process.env.USERPROFILE || "", "AppData", "Local", "Temp");
const detectorPaths = [
  path.join(userTemp, "grounding-dino-cuda-trial", "chat_corpus_cuda_fp16.json"),
  path.join(userTemp, "grounding-dino-cuda-trial", "done_corpus_cuda_fp16.json"),
];

async function listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory()
      ? listImages(fullPath)
      : imageExtensions.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  }));
  return files.flat().sort((a, b) => a.localeCompare(b));
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function readDetectorResults() {
  const byPath = new Map();
  for (const file of detectorPaths) {
    if (!existsSync(file)) continue;
    for (const result of JSON.parse(readFileSync(file, "utf8")).results || []) {
      byPath.set(path.resolve(result.path).toLowerCase(), result);
    }
  }
  return byPath;
}

function lineTrace(line, pageNumber) {
  return {
    page: pageNumber,
    text: line.text,
    confidence: line.confidence,
    bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
    words: (line.words || []).map((word) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 },
    })),
  };
}

const detectorByPath = readDetectorResults();
const allFiles = await listImages(root);
let files = allFiles;
if (fileListPath) {
  const requested = new Set(JSON.parse(readFileSync(fileListPath, "utf8")).map((relativePath) =>
    path.resolve(root, relativePath).toLowerCase()));
  files = allFiles.filter((filePath) => requested.has(path.resolve(filePath).toLowerCase()));
  if (files.length !== requested.size) {
    throw new Error(`OCR file list requested ${requested.size} images, found ${files.length} under ${root}`);
  }
}
await mkdir(path.dirname(outPath), { recursive: true });
const completedPaths = new Set();
if (existsSync(outPath)) {
  const input = readline.createInterface({ input: createReadStream(outPath), crlfDelay: Infinity });
  for await (const line of input) {
    try {
      const row = JSON.parse(line);
      if (row.type === "image" && row.error === null) completedPaths.add(path.resolve(row.source.path).toLowerCase());
    } catch {
      // Ignore only an incomplete final JSONL line; the next run retries that image.
    }
  }
} else {
  appendFileSync(outPath, `${JSON.stringify({ type: "manifest", schema: "digital-evidence.full-pipeline-ocr-trace.v1", createdAt: new Date().toISOString(), total: files.length, selection: fileListPath ? { mode: "explicit-file-list", fileListPath } : { mode: "all-images" }, runtime: { engine: "Tesseract.js", languages: "tha+eng", concurrency }, detector: "prior Grounding DINO CUDA FP16 batch" })}\n`);
}
const pendingIndices = files.map((_, index) => index).filter((index) => !completedPaths.has(path.resolve(files[index]).toLowerCase()));
let cursor = 0;
let completedThisRun = 0;
const workers = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
  const worker = await createWorker("tha+eng", 1, {
    langPath: path.join(appRoot, "public", "ocr", "lang"),
    gzip: false,
    cacheMethod: "none",
  });
  return { worker, index };
}));

try {
  await Promise.all(workers.map(async ({ worker, index }) => {
    while (true) {
      const pendingIndex = cursor++;
      if (pendingIndex >= pendingIndices.length) return;
      const current = pendingIndices[pendingIndex];
      const filePath = files[current];
      const started = Date.now();
      const relativePath = path.relative(root, filePath);
      try {
        const fileStat = await stat(filePath);
        const hash = await sha256(filePath);
        const { data } = await worker.recognize(filePath, {}, { blocks: true });
        const pages = (data.blocks || []).flatMap((block) => block.paragraphs || []).reduce((acc, paragraph) => {
          for (const line of paragraph.lines || []) {
            const page = line.page ?? 1;
            (acc[page] ||= []).push(lineTrace(line, page));
          }
          return acc;
        }, {});
        const record = {
          type: "image",
          source: { path: filePath, relativePath, fileName: path.basename(filePath), bytes: fileStat.size, sha256: hash },
          image: data.imageSize || null,
          ocr: {
            text: data.text || "",
            confidence: data.confidence,
            pages: Object.entries(pages).map(([page, lines]) => ({ page: Number(page), lines })),
            lineCount: Object.values(pages).reduce((sum, lines) => sum + lines.length, 0),
            wordCount: Object.values(pages).flat().reduce((sum, line) => sum + line.words.length, 0),
          },
          error: null,
          elapsedMs: Date.now() - started,
          worker: index,
          detector: detectorByPath.get(path.resolve(filePath).toLowerCase()) || null,
        };
        appendFileSync(outPath, `${JSON.stringify(record)}\n`);
      } catch (error) {
        const record = {
          type: "image",
          source: { path: filePath, relativePath, fileName: path.basename(filePath) },
          ocr: null,
          error: String(error?.stack || error),
          elapsedMs: Date.now() - started,
          worker: index,
        };
        appendFileSync(outPath, `${JSON.stringify(record)}\n`);
      }
      completedThisRun += 1;
      if (completedThisRun % 25 === 0) process.stdout.write(`OCR trace this run ${completedThisRun}; corpus ${completedPaths.size + completedThisRun}/${files.length}\n`);
    }
  }));
} finally {
  await Promise.all(workers.map(({ worker }) => worker.terminate()));
}

process.stdout.write(`DONE ${outPath}\n${JSON.stringify({ total: files.length, resumedSuccessful: completedPaths.size, processedThisRun: completedThisRun, remainingAtStart: pendingIndices.length, detectorCorpusRecords: detectorByPath.size })}\n`);
