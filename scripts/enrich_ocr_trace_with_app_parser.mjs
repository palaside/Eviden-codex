import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { once } from "node:events";
import readline from "node:readline";
import { findSlipOcrRegions } from "../digital-evidence/src/utils/slip-ocr-analysis.ts";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) throw new Error("Usage: node --experimental-strip-types scripts/enrich_ocr_trace_with_app_parser.mjs input.jsonl output.jsonl");

const input = readline.createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
mkdirSync(dirname(outputPath), { recursive: true });
const output = createWriteStream(outputPath, { encoding: "utf8" });
let imageCount = 0;
let parserErrors = 0;

for await (const line of input) {
  if (!line) continue;
  const record = JSON.parse(line);
  if (record.type === "image" && record.ocr && !record.error) {
    const [width, height] = record.detector?.size || [];
    const lines = (record.ocr.pages || []).flatMap((page) => page.lines || []);
    try {
      const candidates = width && height
        ? findSlipOcrRegions(lines, { width, height })
        : [];
      record.appParser = {
        module: "src/utils/slip-ocr-analysis.ts#findSlipOcrRegions",
        input: "full-image Tesseract lines; no QR-anchored crop/retry in this corpus runner",
        candidateCount: candidates.length,
        candidates,
        status: width && height ? "ran" : "skipped_missing_image_dimensions",
      };
    } catch (error) {
      parserErrors += 1;
      record.appParser = { status: "error", error: String(error?.stack || error) };
    }
    imageCount += 1;
  }
  if (!output.write(`${JSON.stringify(record)}\n`)) await once(output, "drain");
}

output.end();
await once(output, "finish");
process.stdout.write(JSON.stringify({ imagesWithOcr: imageCount, parserErrors, outputPath }) + "\n");
