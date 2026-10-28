import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);
const CHECKPOINT_SCHEMA = "digital-evidence-legal-scan-v1";
const PDPA_PROVISION_IDS = ["TH_PDPA_19", "TH_PDPA_23", "TH_PDPA_24", "TH_PDPA_26", "TH_PDPA_37"];

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compileSearchIndex(dictionary) {
  const rules = [];
  for (const provision of dictionary.provisions ?? []) {
    for (const signal of provision.signals ?? []) {
      if (!["exact_statutory_term", "user_watch_phrase"].includes(signal.kind)) continue;
      const phrase = normalizeSearchText(signal.text);
      if (phrase) rules.push({ phrase, source_kind: signal.kind, signal_id: signal.id ?? null, provision });
    }
    for (const item of provision.search_phrases ?? []) {
      const phrase = normalizeSearchText(item.phrase);
      if (phrase && item.source_kind === "curated_review_alias") {
        rules.push({ phrase, source_kind: item.source_kind, signal_id: null, note: item.note ?? null, provision });
      }
    }
  }
  return rules;
}

export function matchLegalSignals(text, index) {
  const normalized = normalizeSearchText(text);
  const compactText = normalized.replace(/\s/g, "");
  const byProvision = new Map();
  for (const rule of index) {
    const phraseCompact = rule.phrase.replace(/\s/g, "");
    if (!normalized.includes(rule.phrase) && !compactText.includes(phraseCompact)) continue;
    const provision = rule.provision;
    if (!byProvision.has(provision.id)) {
      byProvision.set(provision.id, {
        provision_id: provision.id,
        law_id: provision.law_id,
        locator: provision.locator,
        status: "human_review_required",
        statutory_text_excerpt: provision.statutory_text_excerpt,
        matched_phrases: [],
        counter_indicators: provision.counter_indicators ?? [],
        missing_evidence: provision.missing_evidence ?? [],
      });
    }
    const result = byProvision.get(provision.id);
    if (!result.matched_phrases.some((item) => item.phrase === rule.phrase)) {
      result.matched_phrases.push({
        phrase: rule.phrase,
        source_kind: rule.source_kind,
        signal_id: rule.signal_id,
        note: rule.note ?? null,
      });
    }
  }
  return [...byProvision.values()];
}

export function inspectPdpaContext() {
  return {
    status: "context_required",
    violation_found: false,
    provision_ids: PDPA_PROVISION_IDS,
    reason: "ภาพ OCR อย่างเดียวไม่แสดงบทบาทผู้ควบคุม/ผู้ประมวลผล ฐานและวัตถุประสงค์การประมวลผล ความยินยอม มาตรการความปลอดภัย หรือข้อยกเว้นได้ครบ ต้องตรวจบริบทและเอกสารประกอบ",
  };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function collectFiles(directory, root, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await collectFiles(fullPath, root, output);
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      output.push({ full_path: fullPath, relative_path: path.relative(root, fullPath).split(path.sep).join("/") });
    }
  }
  return output;
}

export async function inventoryImages(inputRoot, { includeDirectories = null } = {}) {
  const root = path.resolve(inputRoot);
  const sourceDirectories = includeDirectories?.length
    ? includeDirectories.map((directory) => path.resolve(root, directory))
    : [root];
  for (const directory of sourceDirectories) {
    const relative = path.relative(root, directory);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("โฟลเดอร์ inventory ต้องอยู่ภายใน input root");
    }
  }
  const files = [];
  for (const directory of sourceDirectories) await collectFiles(directory, root, files);
  const groups = new Map();
  for (const file of files) {
    const [sha256, fileStat] = await Promise.all([hashFile(file.full_path), stat(file.full_path)]);
    const item = { ...file, size_bytes: fileStat.size };
    const group = groups.get(sha256) ?? { sha256, source_files: [], file_paths: [], size_bytes: fileStat.size };
    group.source_files.push(item.relative_path);
    group.file_paths.push(item.full_path);
    groups.set(sha256, group);
  }
  return [...groups.values()].sort((a, b) => a.source_files[0].localeCompare(b.source_files[0]));
}

function parseJsonLines(text) {
  const lines = text.split("\n");
  const hasTrailingNewline = text.endsWith("\n");
  const completeLines = hasTrailingNewline ? lines.slice(0, -1) : lines.slice(0, -1);
  const parsed = [];
  for (const line of completeLines) {
    if (!line.trim()) continue;
    parsed.push(JSON.parse(line));
  }
  return parsed;
}

async function prepareCheckpoint(checkpointPath, metadata) {
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  const header = { type: "header", schema: CHECKPOINT_SCHEMA, metadata };
  try {
    const handle = await open(checkpointPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(header)}\n`, "utf8");
    } finally {
      await handle.close();
    }
    return new Set();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }

  const text = await readFile(checkpointPath, "utf8");
  const lastNewline = text.lastIndexOf("\n");
  const completeText = lastNewline >= 0 ? text.slice(0, lastNewline + 1) : "";
  const rows = parseJsonLines(completeText);
  const existingHeader = rows[0];
  if (existingHeader?.type !== "header" || existingHeader.schema !== CHECKPOINT_SCHEMA
    || JSON.stringify(existingHeader.metadata) !== JSON.stringify(metadata)) {
    throw new Error("Checkpoint metadata ไม่ตรงกับ input หรือ dictionary ปัจจุบัน; ใช้ output folder ใหม่เพื่อเริ่มงานใหม่");
  }
  if (completeText.length !== text.length) {
    const handle = await open(checkpointPath, "r+");
    try {
      await handle.truncate(Buffer.byteLength(completeText));
    } finally {
      await handle.close();
    }
  }
  return new Set(rows.filter((row) => row.type === "result" && row.status === "completed").map((row) => row.sha256));
}

export async function runResumableScan({ groups, checkpointPath, metadata, ocrImage, dictionary, onProgress = () => {}, shouldStop = () => false }) {
  const done = await prepareCheckpoint(checkpointPath, metadata);
  const index = compileSearchIndex(dictionary);
  let newlyCompleted = 0;
  const total = groups.length;
  for (const group of groups) {
    if (done.has(group.sha256)) continue;
    if (shouldStop()) break;
    let result;
    try {
      const ocr = await ocrImage(group.file_paths[0]);
      result = {
        type: "result",
        sha256: group.sha256,
        size_bytes: group.size_bytes,
        source_files: group.source_files,
        status: "completed",
        ocr_text: ocr.text ?? "",
        ocr_confidence: Number.isFinite(ocr.confidence) ? ocr.confidence : null,
        matches: matchLegalSignals(ocr.text ?? "", index),
        pdpa_context: inspectPdpaContext(),
      };
    } catch (error) {
      result = {
        type: "result",
        sha256: group.sha256,
        size_bytes: group.size_bytes,
        source_files: group.source_files,
        status: "ocr_error",
        ocr_text: "",
        ocr_confidence: null,
        matches: [],
        pdpa_context: inspectPdpaContext(),
        error: String(error?.message ?? error).slice(0, 500),
      };
    }
    const handle = await open(checkpointPath, "a");
    try {
      await handle.write(`${JSON.stringify(result)}\n`);
    } finally {
      await handle.close();
    }
    done.add(group.sha256);
    newlyCompleted++;
    await onProgress({ completed: done.size, total, new_completed: newlyCompleted, matched: result.matches.length > 0 });
  }
  return { completed: done.size, total, new_completed: newlyCompleted, remaining: Math.max(0, total - done.size) };
}

export function assertOutputOutsideInput(inputRoot, outputDir) {
  const input = path.resolve(inputRoot);
  const output = path.resolve(outputDir);
  const relative = path.relative(input, output);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("โฟลเดอร์ผลลัพธ์ต้องอยู่นอกโฟลเดอร์หลักฐานต้นทาง");
  }
}

export async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
}
