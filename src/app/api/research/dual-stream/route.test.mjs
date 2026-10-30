import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import { attachResearchRun, getResearchArtifacts, resolveReviewCanvasSource } from "../../../../utils/review-preview-source.mjs";

let detections = [];
let detectorError = null;
let generatorError = false;
const sourceGeneratorUrl = new URL("../../../../utils/dual-stream-full-image.mjs", import.meta.url).href;
globalThis.__dualStreamExec = (_exe, args, _options, callback) => {
  assert.ok(args.includes("-c"));
  assert.match(args[1], /SlipLocator/);
  assert.doesNotMatch(args[1], /pytesseract|easyocr|detectAndDecode|Gemini/);
  callback(detectorError, JSON.stringify(detections), "");
};
globalThis.__dualStreamGeneratorFailure = () => generatorError;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/research/dual-stream/route.ts")) {
      if (specifier === "node:child_process") return { url: "data:text/javascript,export const execFile=(...args)=>globalThis.__dualStreamExec(...args)", shortCircuit: true };
      if (specifier.endsWith("dual-stream-full-image.mjs")) {
        return { url: `data:text/javascript,${encodeURIComponent(`import {createFullImageVariants as real} from ${JSON.stringify(sourceGeneratorUrl)}; export async function createFullImageVariants(args) { if(globalThis.__dualStreamGeneratorFailure()) throw new Error('injected generator failure'); return real(args); }`)}`, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
});

const routeUrl = new URL("./route.ts", import.meta.url);
test("approved Node route exists", async () => {
  assert.ok((await readFile(routeUrl, "utf8")).includes('runtime = "nodejs"'));
});
const route = async () => import(routeUrl.href);
const png = await sharp({ create: { width: 8, height: 16, channels: 4, background: "#c8dcee" } }).png().toBuffer();
function request(bytes = png, name = "chat.png", type = "image/png") {
  const form = new FormData();
  if (bytes !== null) form.append("file", new File([bytes], name, { type }));
  return new Request("http://localhost/api/research/dual-stream", { method: "POST", body: form });
}
const temporaryRuns = async () => (await readdir(os.tmpdir())).filter((name) => name.startsWith("digital-evidence-research-"));

test("rejects missing file, unsupported type, empty file, oversized upload and malformed multipart", async () => {
  const { POST } = await route();
  for (const [input, status] of [
    [request(null), 400], [request(png, "x.txt", "text/plain"), 415],
    [request(new Uint8Array()), 400], [request(new Uint8Array(20 * 1024 * 1024 + 1)), 413],
    [new Request("http://localhost", { method: "POST", body: "invalid" }), 400],
  ]) {
    const response = await POST(input);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.reviewOnly, true);
    assert.ok(body.error.code);
    assert.equal(body.manifest, undefined);
  }
});

test("real generators return hashed renderable artifacts attached to the original occurrence", async () => {
  const { POST } = await route();
  detections = [
    { bbox: { x: 1, y: 9, width: 5, height: 6 }, confidence: 0.7 },
    { bbox: { x: 0, y: 0, width: 5, height: 7 }, confidence: 0.8 },
  ];
  const before = await temporaryRuns();
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.reviewOnly, true);
  const sha = createHash("sha256").update(png).digest("hex");
  assert.equal(result.manifest.source.sha256, sha);
  assert.deepEqual(result.manifest.source.dimensions, { width: 8, height: 16 });
  assert.equal(result.manifest.streamA.artifacts.length, 9);
  assert.equal(result.manifest.streamB.slips.length, 2);
  assert.equal(result.manifest.detectionResult.pass, true);
  assert.equal(result.manifest.extractionResult.status, "not_started");
  assert.equal(result.artifacts.length, 23);
  for (const artifact of getResearchArtifacts(result.manifest)) {
    const bytes = Buffer.from(artifact.url.split(",")[1], "base64");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.artifactSha256);
    assert.equal(artifact.reviewOnly, true);
    const size = await sharp(bytes).metadata();
    assert.equal(size.width, artifact.dimensions.width);
    assert.equal(size.height, artifact.dimensions.height);
  }
  const original = new File([png], "chat.png", { type: "image/png" });
  const item = { id: "same-occurrence", file: original, previewUrl: "blob:original", processingFile: original };
  const attached = attachResearchRun(item, result.manifest, sha);
  assert.equal(attached.file, original);
  assert.equal(attached.previewUrl, "blob:original");
  assert.equal(attached.processingFile, item.processingFile);
  for (const artifact of result.artifacts) {
    assert.ok(resolveReviewCanvasSource({ ...attached, selectedReviewArtifactId: artifact.artifactPath }).url);
  }
  assert.deepEqual(await temporaryRuns(), before);
});

test("zero actual detections never becomes a fabricated pass", async () => {
  detections = [];
  const result = await (await (await route()).POST(request())).json();
  assert.equal(result.success, true);
  assert.equal(result.manifest.detectionResult.pass, false);
  assert.equal(result.manifest.streamB.slips.length, 0);
});

test("invalid detector bounds, detector failure, corrupt pixels and generator failure are review-safe and cleaned", async () => {
  const { POST } = await route();
  const before = await temporaryRuns();
  for (const mode of ["bounds", "detector", "generator", "corrupt"]) {
    detections = mode === "bounds" ? [{ bbox: { x: 7, y: 0, width: 9, height: 4 } }] : [];
    detectorError = mode === "detector" ? new Error("detector unavailable") : null;
    generatorError = mode === "generator";
    const response = await POST(mode === "corrupt" ? request(Buffer.from("not pixels")) : request());
    const result = await response.json();
    assert.equal(result.success, false, mode);
    assert.equal(result.reviewOnly, true);
    assert.equal(result.manifest, undefined);
    assert.ok(result.error.code);
    assert.deepEqual(await temporaryRuns(), before);
  }
  detectorError = null;
  generatorError = false;
});

test("process integration calls server with the original file and attaches validated result", async () => {
  const page = await readFile(new URL("../../../page.tsx", import.meta.url), "utf8");
  assert.ok(/fetch\("\/api\/research\/dual-stream"/.test(page));
  assert.ok(/researchForm.append\("file", item.file, item.file.name\)/.test(page));
  assert.ok(/attachResearchRun\(item, payload.manifest, sourceSha\)/.test(page));
  assert.ok(!/import.*dual-stream-slip-crops/.test(page));
});
