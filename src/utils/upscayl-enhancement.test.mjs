import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildUpscaylCommand, createUpscaledDerivedImage } from "./upscayl-enhancement.mjs";

test("builds an argument vector without shell interpolation", () => {
  assert.deepEqual(buildUpscaylCommand({ executable: "upscayl-bin.exe", inputPath: "C:/a b/in.png", outputPath: "C:/out.png", modelDir: "C:/models" }), [
    "upscayl-bin.exe", "-i", "C:/a b/in.png", "-o", "C:/out.png", "-s", "2", "-m", "C:/models", "-n", "upscayl-standard-4x", "-f", "png",
  ]);
});

test("returns unavailable without changing the source", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "upscayl-test-"));
  const source = path.join(dir, "source.png");
  await fs.writeFile(source, Buffer.from("source-pixels"));
  const before = await fs.readFile(source);
  const result = await createUpscaledDerivedImage({
    sourcePath: source,
    outputPath: path.join(dir, "derived.png"),
    env: { UPSCAYL_NCNN_PATH: "missing-upscayl" },
    execFileImpl: async () => { const error = new Error("not found"); error.code = "ENOENT"; throw error; },
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reviewOnly, true);
  assert.deepEqual(await fs.readFile(source), before);
});

test("falls back to an auditable CPU-derived image when Upscayl is unavailable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "upscayl-fallback-test-"));
  const source = path.join(dir, "source.png");
  const output = path.join(dir, "derived.png");
  await fs.writeFile(source, Buffer.from("source-pixels"));
  const result = await createUpscaledDerivedImage({
    sourcePath: source,
    outputPath: output,
    env: {
      UPSCAYL_NCNN_PATH: "missing-upscayl",
      UPSCAYL_ENABLE_CPU_FALLBACK: "true",
      UPSCAYL_PREFER_CPU_FALLBACK: "true",
      PYTHON_EXECUTABLE: "python",
    },
    cwd: dir,
    fallbackScriptPath: path.join(dir, "forensic_image_enhancement.py"),
    execFileImpl: async () => {
      const error = new Error("not found");
      error.code = "ENOENT";
      throw error;
    },
    fallbackExecFileImpl: async (_exe, args) => {
      const fallbackDir = args[args.indexOf("--output-dir") + 1];
      await fs.mkdir(fallbackDir, { recursive: true });
      await fs.writeFile(path.join(fallbackDir, "11_target_300dpi_color.png"), Buffer.from("cpu-derived-pixels"));
    },
    exists: (candidate) => candidate === path.join(dir, "forensic_image_enhancement.py"),
  });
  assert.equal(result.status, "success");
  assert.equal(result.engine, "opencv-forensic-fallback");
  assert.equal(result.reviewOnly, true);
  assert.equal(result.fallbackReason, "upscayl_preferred_cpu_fallback");
  assert.deepEqual(await fs.readFile(source), Buffer.from("source-pixels"));
  assert.deepEqual(await fs.readFile(output), Buffer.from("cpu-derived-pixels"));
});

test("records source and derived hashes for a successful derived image", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "upscayl-test-"));
  const source = path.join(dir, "source.png");
  const output = path.join(dir, "derived.png");
  await fs.writeFile(source, Buffer.from("source-pixels"));
  const result = await createUpscaledDerivedImage({
    sourcePath: source,
    outputPath: output,
    scale: 4,
    execFileImpl: async (_exe, args) => { await fs.writeFile(args[args.indexOf("-o") + 1], Buffer.from("derived-pixels")); },
  });
  assert.equal(result.status, "success");
  assert.notEqual(result.sourceSha256, result.derivedSha256);
  assert.equal(result.reviewOnly, true);
});
