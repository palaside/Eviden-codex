#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker } from "tesseract.js";
import dictionary from "../src/data/legal_signal_dictionary.json" with { type: "json" };
import { assertOutputOutsideInput, inventoryImages, runResumableScan, writeJsonAtomically } from "./legal-signal-scan-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_FOLDERS = ["แชทที่ 1", "แชทที่ 2", "แชทที่ 3", "Done"];

function parseArgs(argv) {
  const options = { resume: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--resume") options.resume = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--input-root", "--output-dir"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`ต้องระบุค่าหลัง ${arg}`);
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    } else throw new Error(`ไม่รู้จัก option: ${arg}`);
  }
  if (!options.help && (!options.inputRoot || !options.outputDir)) {
    throw new Error("รูปแบบ: node scripts/legal-signal-scan.mjs --input-root <For Test> --output-dir <ผลลัพธ์นอก For Test> [--resume]");
  }
  return options;
}

async function countResults(checkpointPath) {
  const text = await readFile(checkpointPath, "utf8");
  const rows = text.split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row.type === "result");
  const latest = new Map(rows.map((row) => [row.sha256, row]));
  const values = [...latest.values()];
  const provisionCounts = {};
  let candidateImages = 0;
  for (const row of values) {
    if (row.matches.length) candidateImages++;
    for (const match of row.matches) provisionCounts[match.provision_id] = (provisionCounts[match.provision_id] ?? 0) + 1;
  }
  return {
    unique_images_completed: values.filter((row) => row.status === "completed").length,
    unique_images_ocr_error: values.filter((row) => row.status === "ocr_error").length,
    candidate_images_for_human_review: candidateImages,
    provision_candidate_counts: provisionCounts,
    pdpa_context_required_images: values.filter((row) => row.pdpa_context?.status === "context_required").length,
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Local-only evidence OCR + legal signal scan.\nUsage: node scripts/legal-signal-scan.mjs --input-root <path> --output-dir <path> [--resume]\n");
    return;
  }

  const inputRoot = path.resolve(options.inputRoot);
  const outputDir = path.resolve(options.outputDir);
  assertOutputOutsideInput(inputRoot, outputDir);
  for (const folder of INPUT_FOLDERS) {
    const folderPath = path.join(inputRoot, folder);
    if (!(await stat(folderPath).catch(() => null))?.isDirectory()) throw new Error(`ไม่พบโฟลเดอร์ทดสอบที่กำหนด: ${folderPath}`);
  }

  const outputExists = Boolean(await stat(outputDir).catch(() => null));
  const checkpointPath = path.join(outputDir, "results.jsonl");
  if (outputExists && !options.resume) throw new Error("โฟลเดอร์ผลลัพธ์มีอยู่แล้ว; ใช้ --resume หรือระบุโฟลเดอร์ใหม่เพื่อป้องกันการเขียนทับ");
  if (!outputExists && options.resume) throw new Error("ใช้ --resume ได้เมื่อโฟลเดอร์ผลลัพธ์เดิมมีอยู่แล้ว");
  if (outputExists && options.resume && !(await stat(checkpointPath).catch(() => null))) throw new Error("ไม่พบ checkpoint ในโฟลเดอร์ผลลัพธ์นี้");

  if (!outputExists) {
    await mkdir(path.dirname(outputDir), { recursive: true });
    await mkdir(outputDir);
  }

  process.stdout.write("กำลังสร้าง inventory และ SHA-256 ของภาพ (ไม่แก้ไขไฟล์ต้นฉบับ)...\n");
  const groups = await inventoryImages(inputRoot, { includeDirectories: INPUT_FOLDERS });
  const totalFiles = groups.reduce((sum, item) => sum + item.source_files.length, 0);
  const metadata = {
    dictionary_version: dictionary.dictionary_version,
    dictionary_sha256: createHash("sha256").update(await readFile(path.join(ROOT, "src/data/legal_signal_dictionary.json"))).digest("hex"),
    input_root: inputRoot,
    input_folders: INPUT_FOLDERS,
    image_files: totalFiles,
    unique_sha256_groups: groups.length,
    language: "tha+eng",
    engine: "tesseract.js/6.0.1-local-traineddata",
  };
  if (outputExists && options.resume) {
    const checkpointText = await readFile(checkpointPath, "utf8");
    const header = JSON.parse(checkpointText.slice(0, checkpointText.indexOf("\n")));
    if (header.type !== "header" || header.schema !== "digital-evidence-legal-scan-v1"
      || JSON.stringify(header.metadata) !== JSON.stringify(metadata)) {
      throw new Error("Checkpoint ไม่ตรงกับ inventory/dictionary ปัจจุบัน; ระบุ output directory ใหม่เพื่อไม่ทับผลเดิม");
    }
  }
  await writeJsonAtomically(path.join(outputDir, "inventory.json"), {
    ...metadata,
    exact_duplicate_files_skipped: totalFiles - groups.length,
    source_file_groups: groups.map(({ sha256, size_bytes, source_files }) => ({ sha256, size_bytes, source_files })),
  });
  process.stdout.write(`พบ ${totalFiles} ไฟล์, ${groups.length} SHA ไม่ซ้ำ, ข้าม OCR ไฟล์ซ้ำ ${totalFiles - groups.length} ไฟล์\n`);

  let currentLabel = "";
  let lastPercent = -1;
  let newMatchedImages = 0;
  let stopRequested = false;
  const onInterrupt = () => {
    stopRequested = true;
    process.stdout.write("\nรับคำสั่งหยุดแล้ว จะจบภาพปัจจุบันและเก็บ checkpoint...\n");
  };
  process.once("SIGINT", onInterrupt);

  const localWorkerOptions = {
    langPath: path.join(ROOT, "public/ocr/lang"),
    gzip: false,
    logger: (message) => {
      if (message.status !== "recognizing text" || !currentLabel) return;
      const percent = Math.floor((message.progress ?? 0) * 100);
      if (percent >= lastPercent + 25) {
        lastPercent = percent;
        process.stdout.write(`OCR ${currentLabel}: ${percent}%\n`);
      }
    },
  };

  let worker;
  try {
    worker = await createWorker("tha+eng", 1, localWorkerOptions);
    const runStarted = new Date().toISOString();
    const result = await runResumableScan({
      groups,
      checkpointPath,
      metadata,
      dictionary,
      shouldStop: () => stopRequested,
      onProgress: async ({ completed, total, matched }) => {
        if (matched) newMatchedImages++;
        const progress = { run_started_at: runStarted, updated_at: new Date().toISOString(), completed, total, matched_images_this_run: newMatchedImages, status: completed >= total ? "complete" : "running" };
        if (completed % 5 === 0 || completed === total) {
          await writeJsonAtomically(path.join(outputDir, "progress.json"), progress);
          process.stdout.write(`เสร็จ ${completed}/${total}${matched ? " · พบสัญญาณให้ตรวจ" : ""}\n`);
        }
      },
      ocrImage: async (filePath) => {
        currentLabel = path.relative(inputRoot, filePath);
        lastPercent = -1;
        const { data } = await worker.recognize(filePath);
        return { text: data.text, confidence: data.confidence };
      },
    });

    const summary = await countResults(checkpointPath);
    const finalReport = {
      ...metadata,
      started_at: runStarted,
      finished_at: new Date().toISOString(),
      scan_status: result.remaining === 0
        ? summary.unique_images_ocr_error === 0 ? "complete" : "complete_with_errors"
        : "paused_with_checkpoint",
      unique_completed: result.completed,
      unique_total: result.total,
      remaining: result.remaining,
      exact_duplicate_files_skipped: totalFiles - groups.length,
      matching_policy: "Exact statutory terms, user watch phrases, and explicit curated aliases only; semantic_criteria are reviewer guidance and are never searched.",
      legal_decision: false,
      ...summary,
    };
    await writeJsonAtomically(path.join(outputDir, "summary.json"), finalReport);
    await writeJsonAtomically(path.join(outputDir, "progress.json"), { ...finalReport, updated_at: new Date().toISOString() });
    process.stdout.write(`จบการทำงาน: ${finalReport.scan_status}; candidates=${summary.candidate_images_for_human_review}; OCR errors=${summary.unique_images_ocr_error}\n`);
    process.stdout.write(`ผลอยู่ที่: ${outputDir}\n`);
    if (stopRequested) process.exitCode = 130;
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    await worker?.terminate();
  }
}

run().catch((error) => {
  process.stderr.write(`สแกนไม่สำเร็จ: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
