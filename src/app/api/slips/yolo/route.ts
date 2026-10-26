import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { z } from "zod";
import { SlipExtractionSchema } from "@/schemas/slip.schema";

const ResultSchema = z.object({
  slips: z.array(z.object({
    bbox_1000: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    visual_cues: z.array(z.string()).min(1),
    data: SlipExtractionSchema,
    bbox: z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }),
    confidence: z.number().min(0).max(1),
    qr_detected: z.boolean(),
  })).max(20),
});

function runPython(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const configuredPython = process.env.YOLO_PYTHON;
    const localPython = path.join(process.cwd(), "scripts", "slip_cv", ".venv-slipcv-cuda118", "Scripts", "python.exe");
    const legacyPython = path.join(process.cwd(), "digital-evidence", "scripts", "slip_cv", ".venv-slipcv-cuda118", "Scripts", "python.exe");
    const python = configuredPython || (fsSync.existsSync(localPython) ? localPython : legacyPython);
    const child = spawn(python, [path.join(process.cwd(), "scripts", "yolo_slip_api.py"), ...args], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `YOLO process exited ${code}`)));
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ success: false, message: "ต้องส่ง file" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const tempPath = path.join(os.tmpdir(), `digital-evidence-yolo-${sha256}.img`);
  await fs.writeFile(tempPath, bytes);
  try {
    const model = process.env.YOLO_MODEL || path.join(process.cwd(), "models", "slip-yolov8n.pt");
    const tesseract = process.env.TESSERACT_CMD || "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";
    // The trained local model returns a reviewable slip box for the target
    // chat at 0.10; keep the result review-only so lowering this threshold
    // cannot silently confirm a false positive.
    const confidence = process.env.YOLO_CONFIDENCE || "0.10";
    const raw = await runPython(["--image", tempPath, "--model", model, "--device", process.env.YOLO_DEVICE || "0", "--confidence", confidence, "--tesseract", tesseract, "--engine", "multiengine"]);
    const parsed = ResultSchema.parse(JSON.parse(raw));
    return NextResponse.json({ success: true, candidates: parsed.slips, metadata: { file_name: file.name, mime_type: file.type || "image/jpeg", sha256, size_bytes: bytes.length, extracted_at: new Date().toISOString(), engine: "local-yolo-tesseract" } }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "YOLO pipeline failed" }, { status: 502 });
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}
