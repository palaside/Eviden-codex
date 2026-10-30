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
let detectorProbe = null;
const sourceGeneratorUrl = new URL("../../../../utils/dual-stream-full-image.mjs", import.meta.url).href;
globalThis.__dualStreamExec = (_exe, args, _options, callback) => {
  assert.ok(args.includes("-c"));
  assert.match(args[1], /SlipLocator/);
  assert.doesNotMatch(args[1], /pytesseract|easyocr|detectAndDecode|Gemini/);
  if (detectorProbe) {
    Promise.resolve().then(() => detectorProbe(args[3])).then(
      () => callback(detectorError, JSON.stringify(detections), ""),
      (error) => callback(error, "", ""),
    );
    return;
  }
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

test("EXIF 6 detector raster and crop pixels share one normalized space while original bytes/hash remain intact", async () => {
  const { POST } = await route();
  const raw = Buffer.alloc(12 * 24 * 3);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 12; x++) {
    raw.set([x * 19, y * 9, (x * 7 + y * 3) % 256], (y * 12 + x) * 3);
  }
  const jpeg = await sharp(raw, { raw: { width: 12, height: 24, channels: 3 } })
    .withMetadata({ orientation: 6 }).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
  const originalSnapshot = Buffer.from(jpeg);
  const expected = await sharp(jpeg).rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(expected.info.width, 24);
  assert.equal(expected.info.height, 12);
  const bbox = { x: 16, y: 2, width: 7, height: 8 };
  detections = [{ bbox, confidence: 0.8 }];
  let detectorRaster;
  detectorProbe = async (inputPath) => {
    detectorRaster = await readFile(inputPath);
  };
  const before = await temporaryRuns();
  let response;
  try { response = await POST(request(jpeg, "oriented.jpg", "image/jpeg")); }
  finally { detectorProbe = null; }
  assert.ok(detectorRaster, "actual detector input must be inspected");
  const detectorMetadata = await sharp(detectorRaster).metadata();
  assert.deepEqual([detectorMetadata.width, detectorMetadata.height], [24, 12]);
  assert.equal(detectorMetadata.orientation, undefined, "normalized detector PNG must not rotate a second time");
  assert.deepEqual(await sharp(detectorRaster).ensureAlpha().raw().toBuffer(), expected.data);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.reviewOnly, true);
  assert.equal(result.manifest.source.sha256, createHash("sha256").update(originalSnapshot).digest("hex"));
  assert.deepEqual(result.manifest.source.dimensions, { width: 24, height: 12 });
  assert.deepEqual(result.manifest.coordinateSpace, {
    name: "exif-normalized", sourceExifOrientation: 6,
    encodedDimensions: { width: 12, height: 24 }, normalizedDimensions: { width: 24, height: 12 },
    encodedToNormalized: [0, 1, -1, 0, 24, 0], normalizedToEncoded: [0, -1, 1, 0, 0, 24],
  });
  assert.equal(result.manifest.detectionResult.pass, false, "one detection is not the expected two");
  const slip = result.manifest.streamB.slips[0];
  assert.deepEqual(slip.bbox, bbox);
  assert.deepEqual(slip.cropOriginal.bbox, bbox);
  const crop = Buffer.from(slip.cropOriginal.url.split(",")[1], "base64");
  const actualPixels = await sharp(crop).ensureAlpha().raw().toBuffer();
  const expectedCrop = await sharp(expected.data, { raw: expected.info }).extract({ left: 16, top: 2, width: 7, height: 8 }).raw().toBuffer();
  assert.deepEqual(actualPixels, expectedCrop, "crop must select the exact normalized evidence pixels");
  const originalArtifact = result.manifest.streamA.artifacts.find((a) => a.artifactType === "original_reference");
  assert.deepEqual(Buffer.from(originalArtifact.url.split(",")[1], "base64"), originalSnapshot);
  assert.deepEqual(jpeg, originalSnapshot);
  assert.deepEqual(await temporaryRuns(), before);
});

test("real decoder rejects pixels above 4M as 413 PIXEL_LIMIT and accepts exactly 4M through detection", async () => {
  const { POST } = await route();
  const before = await temporaryRuns();
  const oversized = await sharp({ create: { width: 2001, height: 2000, channels: 3, background: "white" } }).png().toBuffer();
  const rejected = await POST(request(oversized));
  assert.equal(rejected.status, 413);
  const rejectedBody = await rejected.json();
  assert.equal(rejectedBody.error.code, "PIXEL_LIMIT");
  assert.equal(rejectedBody.reviewOnly, true);
  assert.equal(rejectedBody.manifest, undefined);
  const exact = await sharp({ create: { width: 2000, height: 2000, channels: 3, background: "white" } }).png().toBuffer();
  let detectorSize;
  detectorError = new Error("stop at detector boundary, avoid generating 64M test pixels");
  detectorProbe = async (inputPath) => {
    const metadata = await sharp(await readFile(inputPath)).metadata();
    detectorSize = [metadata.width, metadata.height];
  };
  try {
    const accepted = await POST(request(exact));
    assert.deepEqual(detectorSize, [2000, 2000]);
    assert.equal(accepted.status, 503);
    assert.equal((await accepted.json()).error.code, "DETECTOR_UNAVAILABLE");
  } finally { detectorError = null; detectorProbe = null; }
  assert.deepEqual(await temporaryRuns(), before);
});
