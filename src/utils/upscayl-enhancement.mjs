import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveDerivedImagePython } from "./derived-python-runtime.mjs";

const execFile = promisify(nodeExecFile);
const ALLOWED_SCALES = new Set([2, 4]);

export function resolveUpscaylExecutable(env = process.env) {
  const configured = env.UPSCAYL_NCNN_PATH?.trim();
  if (configured) return configured;
  if (process.platform === "win32") {
    const installed = "C:\\Program Files\\Upscayl\\resources\\bin\\upscayl-bin.exe";
    return installed;
  }
  return process.platform === "win32" ? "upscayl-ncnn.exe" : "upscayl-ncnn";
}

export function buildUpscaylCommand({ executable, inputPath, outputPath, scale = 2, model = "upscayl-standard-4x", modelDir }) {
  if (!ALLOWED_SCALES.has(scale)) throw new RangeError("Upscayl scale must be 2 or 4");
  return [executable, "-i", inputPath, "-o", outputPath, "-s", String(scale), "-m", modelDir || "models", "-n", model, "-f", "png"];
}

function dimensions(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

async function createCpuFallback({
  sourcePath,
  outputPath,
  sourceBuffer,
  sourceSha256,
  sourceDimensions,
  scale,
  model,
  env,
  cwd,
  fallbackScriptPath,
  fallbackExecFileImpl,
  exists,
  fallbackReason,
  timeoutMs,
}) {
  if (!(await exists(fallbackScriptPath))) return null;
  const fallbackDir = await fs.mkdtemp(path.join(path.dirname(outputPath), ".forensic-derived-"));
  try {
    const fallbackPython = resolveDerivedImagePython({ env, cwd });
    await fallbackExecFileImpl(fallbackPython, [
      fallbackScriptPath,
      "--image", sourcePath,
      "--output-dir", fallbackDir,
      "--source-dpi", "150",
      "--target-dpi", String(150 * scale),
    ], { timeout: Math.max(timeoutMs, 120_000), windowsHide: true });
    const fallbackOutput = path.join(fallbackDir, "11_target_300dpi_color.png");
    const derivedBuffer = await fs.readFile(fallbackOutput);
    await fs.copyFile(fallbackOutput, outputPath);
    return {
      status: "success",
      sourceSha256,
      derivedSha256: crypto.createHash("sha256").update(derivedBuffer).digest("hex"),
      engine: "opencv-forensic-fallback",
      model,
      scale,
      sourceDimensions,
      derivedDimensions: dimensions(derivedBuffer),
      outputPath,
      error: null,
      fallbackReason,
      reviewOnly: true,
    };
  } finally {
    await fs.rm(fallbackDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function createUpscaledDerivedImage({
  sourcePath,
  outputPath,
  sourceSha256 = null,
  scale = 2,
  model = "upscayl-standard-4x",
  modelDir = null,
  env = process.env,
  execFileImpl = execFile,
  fallbackExecFileImpl = execFile,
  fallbackScriptPath = path.resolve(process.cwd(), "scripts", "forensic_image_enhancement.py"),
  exists = async (candidate) => { try { await fs.access(candidate); return true; } catch { return false; } },
  cwd = process.cwd(),
  timeoutMs = 600_000,
}) {
  if (!sourcePath || !outputPath) throw new TypeError("sourcePath and outputPath are required");
  if (!ALLOWED_SCALES.has(scale)) throw new RangeError("Upscayl scale must be 2 or 4");
  const sourceBuffer = await fs.readFile(sourcePath);
  const actualSourceSha256 = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
  if (sourceSha256 && sourceSha256 !== actualSourceSha256) {
    throw new Error("source SHA-256 does not match the input file");
  }
  const executable = resolveUpscaylExecutable(env);
  const temporaryOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(temporaryOutput), { recursive: true });
  const resolvedModelDir = modelDir || env.UPSCAYL_MODEL_DIR || (process.platform === "win32"
    ? path.resolve(path.dirname(executable), "..", "models")
    : "models");
  const args = buildUpscaylCommand({ executable, inputPath: sourcePath, outputPath: temporaryOutput, scale, model, modelDir: resolvedModelDir }).slice(1);
  const sourceDimensions = dimensions(sourceBuffer);
  const maxUpscaylPixels = Number(env.UPSCAYL_MAX_PIXELS || 4_000_000);
  const largeSource = sourceDimensions && sourceDimensions.width * sourceDimensions.height > maxUpscaylPixels;
  const preferCpuFallback = env.UPSCAYL_PREFER_CPU_FALLBACK === "true" || (largeSource && env.UPSCAYL_SKIP_LARGE_IMAGES !== "false");
  if (preferCpuFallback && env.UPSCAYL_ENABLE_CPU_FALLBACK !== "false") {
    try {
      const fallback = await createCpuFallback({
        sourcePath, outputPath: temporaryOutput, sourceBuffer, sourceSha256: actualSourceSha256,
        sourceDimensions, scale, model, env, cwd, fallbackScriptPath, fallbackExecFileImpl,
        exists, fallbackReason: largeSource ? "large_source_cpu_fallback" : "upscayl_preferred_cpu_fallback", timeoutMs,
      });
      if (fallback) return fallback;
    } catch {
      // Continue to the configured Upscayl attempt when the CPU fallback is unavailable.
    }
  }
  try {
    await execFileImpl(executable, args, { timeout: timeoutMs, windowsHide: true });
  } catch (error) {
    const code = error?.code === "ENOENT" ? "unavailable" : "failed";
    const upscaylError = error instanceof Error ? error.message : String(error);
    if (env.UPSCAYL_ENABLE_CPU_FALLBACK !== "false") {
      try {
        const fallback = await createCpuFallback({
          sourcePath, outputPath: temporaryOutput, sourceBuffer, sourceSha256: actualSourceSha256,
          sourceDimensions, scale, model, env, cwd, fallbackScriptPath, fallbackExecFileImpl,
          exists, fallbackReason: code === "unavailable" ? "upscayl_unavailable" : "upscayl_failed_or_timed_out", timeoutMs,
        });
        if (fallback) return { ...fallback, error: upscaylError };
      } catch (fallbackError) {
        return {
          status: code,
          sourceSha256: actualSourceSha256,
          derivedSha256: null,
          engine: "upscayl-ncnn",
          model,
          scale,
          sourceDimensions,
          derivedDimensions: null,
          outputPath: null,
          error: `${upscaylError}; CPU fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          reviewOnly: true,
        };
      }
    }
    return {
      status: code,
      sourceSha256: actualSourceSha256,
      derivedSha256: null,
      engine: "upscayl-ncnn",
      model,
      scale,
      sourceDimensions: dimensions(sourceBuffer),
      derivedDimensions: null,
      outputPath: null,
      error: upscaylError,
      reviewOnly: true,
    };
  }
  const derivedBuffer = await fs.readFile(temporaryOutput);
  return {
    status: "success",
    sourceSha256: actualSourceSha256,
    derivedSha256: crypto.createHash("sha256").update(derivedBuffer).digest("hex"),
    engine: "upscayl-ncnn",
    model,
    scale,
    sourceDimensions: dimensions(sourceBuffer),
    derivedDimensions: dimensions(derivedBuffer),
    outputPath: temporaryOutput,
    error: null,
    reviewOnly: true,
  };
}
