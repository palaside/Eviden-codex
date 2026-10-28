import { spawn } from "node:child_process";
import path from "node:path";
import { resolveDerivedImagePython } from "@/utils/derived-python-runtime.mjs";
import { resolveExportPython } from "@/utils/export-python-runtime.mjs";
import { formatCommandFailure } from "@/utils/command-failure.mjs";

interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function readExportRequest(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const rawPayload = form.get("payload");
    if (typeof rawPayload !== "string") throw new Error("ไม่พบข้อมูลสำหรับส่งออก");
    const payload = JSON.parse(rawPayload) as unknown;
    const sourceFiles = form.getAll("sourceFiles").filter((entry): entry is File => typeof entry !== "string");
    return {
      exportPassword: form.get("exportPassword"),
      payload,
      sourceFiles,
    };
  }
  const body = await request.json() as { exportPassword?: unknown; payload?: unknown };
  return { exportPassword: body.exportPassword, payload: body.payload, sourceFiles: [] as File[] };
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; stdin?: string; timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeoutMs = options.timeoutMs ?? 120_000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(-12_000); });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-12_000); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(formatCommandFailure({ code, signal: child.signalCode, timedOut, timeoutMs, stderr, stdout })));
    });
    child.stdin.end(options.stdin ?? "");
  });
}

export async function runPdfExporter(inputPath: string, outputPath: string, password: string) {
  const python = resolveExportPython();
  const script = path.join(process.cwd(), "scripts", "encrypted_pdf_export.py");
  await runCommand(python, [script, "--input", inputPath, "--output", outputPath, "--password-stdin"], {
    stdin: password,
  });
}

export async function runEvidenceContentPdfExporter(inputPath: string, outputPath: string, password: string) {
  const python = resolveExportPython();
  const script = path.join(process.cwd(), "scripts", "evidence_content_pdf_export.py");
  await runCommand(python, [script, "--input", inputPath, "--output", outputPath, "--password-stdin"], {
    stdin: password,
    timeoutMs: 120_000,
  });
}

export async function runSummaryIndexPdfExporter(inputPath: string, outputPath: string, password: string) {
  const python = resolveExportPython();
  const script = path.join(process.cwd(), "scripts", "summary_table_pdf_export.py");
  await runCommand(python, [script, "--input", inputPath, "--output", outputPath, "--password-stdin"], {
    stdin: password,
    timeoutMs: 120_000,
  });
}

export async function runConsistentReviewPacketPdfExporter(inputPath: string, outputPath: string, password: string) {
  const python = resolveExportPython();
  const script = path.join(process.cwd(), "scripts", "consistent_review_packet_pdf_export.py");
  await runCommand(python, [script, "--input", inputPath, "--output", outputPath, "--password-stdin"], {
    stdin: password,
    timeoutMs: 120_000,
  });
}

export async function runDerivedImagePdfExporter(inputPath: string, outputPath: string, sourceName: string) {
  const python = resolveDerivedImagePython();
  const script = path.join(process.cwd(), "scripts", "derived_image_pdf.py");
  const model = path.join(process.cwd(), "scripts", "models", "EDSR_x4.pb");
  await runCommand(python, [script, "--input", inputPath, "--output", outputPath, "--source-name", sourceName, "--model", model], {
    timeoutMs: 300_000,
  });
}

export async function verifyPdfProtection(pdfPath: string, password: string) {
  const python = resolveExportPython();
  const verifier = [
    "import sys",
    "from pypdf import PdfReader",
    "password = sys.stdin.read()",
    "reader = PdfReader(sys.argv[1])",
    "expected = bool(password)",
    "assert reader.is_encrypted == expected, 'PDF protection state mismatch'",
    "assert not expected or reader.decrypt(password), 'PDF password did not unlock the file'",
    "assert (reader.metadata or {}).get('/ProtectionStatus') == ('Protected' if expected else 'NoPassword'), 'PDF metadata mismatch'",
    "assert len(reader.pages) > 0, 'PDF has no pages'",
  ].join("; ");
  await runCommand(python, ["-c", verifier, pdfPath], { stdin: password });
}

export function safeFileStem(value: unknown) {
  const text = typeof value === "string" ? value : "Evidence";
  const stem = text.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[_\.]+|[_\.]+$/g, "");
  return stem.slice(0, 64) || "Evidence";
}
