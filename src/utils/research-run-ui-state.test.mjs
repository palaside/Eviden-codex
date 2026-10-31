import assert from "node:assert/strict";
import test from "node:test";
import * as review from "./review-preview-source.mjs";
import { createArtifactRecord, createResearchRunManifest } from "./dual-stream-enhancement.mjs";

const sha = "a".repeat(64);
function fixture() {
  const run = createResearchRunManifest({ sourceFileName: "chat.jpg", sourceSha256: sha, sourceDimensions: { width: 200, height: 600 } });
  const a = createArtifactRecord({ sourceFileName: "chat.jpg", sourceSha256: sha, artifactPath: "derived/stream-a/sharpen.png", artifactSha256: "b".repeat(64), stream: "A", artifactType: "full_image_variant", dimensions: { width: 200, height: 600 }, transform: { engine: "test", operations: ["sharpen"] } });
  const b = createArtifactRecord({ ...a, stream: "B", artifactType: "slip_crop_original", artifactPath: "derived/stream-b/slip-01/crop-original.png", dimensions: { width: 50, height: 80 }, bbox: { x: 10, y: 20, width: 50, height: 80 }, transform: { engine: "crop", operations: ["crop"] } });
  run.streamA.artifacts = [{ ...a, variant: "sharpen", url: "data:image/png;base64,AQ==" }];
  run.streamB.detections = [{ index: 1, bbox: b.bbox }];
  run.streamB.slips = [{ index: 1, cropOriginal: { ...b, variant: "crop-original", url: "data:image/png;base64,Ag==" }, cropVariants: [] }];
  return { previewUrl: "blob:original", reviewPreviewUrl: "data:image/png;base64,Aw==", meta: { sha256: sha }, researchRun: run };
}

test("explicit original selection retains original URL and source SHA", () => {
  const item = fixture();
  const source = review.resolveReviewCanvasSource({ ...item, selectedReviewArtifactId: "original" });
  assert.equal(source.url, "blob:original");
  assert.equal(source.sourceKind, "original");
  assert.equal(source.sourceSha256, sha);
  assert.equal(item.reviewPreviewUrl, "data:image/png;base64,Aw==");
});
test("Stream A selection resolves artifact without modifying original", () => {
  const item = { ...fixture(), selectedReviewArtifactId: "derived/stream-a/sharpen.png" };
  const source = review.resolveReviewCanvasSource(item);
  assert.equal(source.stream, "A");
  assert.equal(source.variant, "sharpen");
  assert.equal(source.reviewOnly, true);
  assert.equal(review.getReviewPreviewSource(item), "data:image/png;base64,AQ==");
  assert.equal(item.previewUrl, "blob:original");
});
test("Stream B slip-01 resolves the correct crop and label", () => {
  const item = { ...fixture(), selectedReviewArtifactId: "derived/stream-b/slip-01/crop-original.png" };
  const source = review.resolveReviewCanvasSource(item);
  assert.equal(source.stream, "B");
  assert.equal(source.url, "data:image/png;base64,Ag==");
  assert.match(review.formatReviewCanvasLabel(source), /Stream B.*slip-01.*crop-original/);
  assert.match(review.formatReviewCanvasLabel(source), /review-only/);
});
test("missing derived URL falls back to original for an explicit selection", () => {
  const item = fixture();
  delete item.researchRun.streamA.artifacts[0].url;
  assert.equal(review.resolveReviewCanvasSource({ ...item, selectedReviewArtifactId: "derived/stream-a/sharpen.png" }).url, item.previewUrl);
  assert.equal(review.getReviewPreviewSource({ previewUrl: "blob:source" }), "blob:source");
});
test("legacy derived blob preview works in-session but is not persisted", () => {
  const item = { previewUrl: "blob:original", reviewPreviewUrl: "blob:derived" };
  assert.equal(review.getReviewPreviewSource(item), "blob:derived");
  assert.equal(review.prepareResearchQueueForPersistence([item])[0].reviewPreviewUrl, undefined);
});
test("overlay uses original image and source-coordinate detections", () => {
  const item = fixture();
  const source = review.resolveReviewCanvasSource({ ...item, selectedReviewArtifactId: "detected-overlay" });
  assert.equal(source.url, item.previewUrl);
  assert.equal(source.sourceKind, "detected-overlay");
  assert.deepEqual(source.detections, item.researchRun.streamB.detections);
});
test("reject mismatched provenance and non-review artifacts", () => {
  const item = fixture();
  const run = structuredClone(item.researchRun);
  run.streamA.artifacts[0].sourceSha256 = "c".repeat(64);
  assert.throws(() => review.attachResearchRun(item, run, sha), /source/i);
  run.streamA.artifacts[0].sourceSha256 = sha;
  run.streamA.artifacts[0].reviewOnly = false;
  assert.throws(() => review.attachResearchRun(item, run, sha), /review/i);
  assert.throws(() => review.attachResearchRun(item, item.researchRun, "d".repeat(64)), /source/i);
});
test("attachment preserves OCR, confirmation, originals and selects explicit original", () => {
  const item = { ...fixture(), file: new File(["raw"], "chat.jpg"), data: { name: "OCR" }, isConfirmed: true };
  const next = review.attachResearchRun(item, item.researchRun, sha);
  assert.equal(next.file, item.file);
  assert.equal(next.data, item.data);
  assert.equal(next.isConfirmed, true);
  assert.equal(next.selectedReviewArtifactId, "original");
  assert.equal(next.researchRun.extractionResult.status, "not_started");
});
test("persistence drops processing Files and transient URLs, keeps provenance and durable image data", () => {
  const item = { ...fixture(), processingFile: new File(["derived"], "derived.png"), reviewPreviewUrl: "blob:old", selectedReviewArtifactId: "derived/stream-a/sharpen.png" };
  item.researchRun.streamB.slips[0].cropOriginal.url = "blob:old-crop";
  const [stored] = review.prepareResearchQueueForPersistence([item]);
  assert.equal(stored.processingFile, undefined);
  assert.equal(stored.reviewPreviewUrl, undefined);
  assert.equal(stored.researchRun.streamB.slips[0].cropOriginal.url, undefined);
  assert.equal(stored.researchRun.streamA.artifacts[0].url, "data:image/png;base64,AQ==");
  assert.equal(stored.researchRun.source.sha256, sha);
  assert.equal(item.researchRun.streamB.slips[0].cropOriginal.url, "blob:old-crop");
});

test("Task 1–3 generated contracts attach and expose all A/B images for review", async () => {
  const { createHash } = await import("node:crypto");
  const { createFullImageVariants } = await import("./dual-stream-full-image.mjs");
  const { createSlipCropArtifacts } = await import("./dual-stream-slip-crops.mjs");
  const bytes = Uint8Array.from([10, 20, 30]);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const pixelBuffer = new Uint8ClampedArray(4 * 6 * 4).fill(120);
  const source = { fileName: "fixture.jpg", bytes, width: 4, height: 6, pixelBuffer };
  const artifactWriter = async ({ bytes: artifactBytes, metadata }) => ({ ...metadata, url: `data:image/png;base64,${Buffer.from(artifactBytes).toString("base64")}` });
  const a = await createFullImageVariants({ source, sourceSha256, width: 4, height: 6, pixelBuffer, artifactWriter });
  const detections = [{ bbox: { x: 0, y: 0, width: 2, height: 2 } }, { bbox: { x: 1, y: 3, width: 2, height: 2 } }];
  const b = await createSlipCropArtifacts({ source, sourceSha256, detections, artifactWriter });
  const run = createResearchRunManifest({ sourceFileName: source.fileName, sourceSha256, sourceDimensions: { width: 4, height: 6 } });
  run.streamA.artifacts = a.artifacts;
  run.streamB = { detections, slips: b.slips };
  const item = review.attachResearchRun({ previewUrl: "blob:original" }, run, sourceSha256);
  assert.equal(review.getResearchArtifacts(item.researchRun).length, 23);
  assert.equal(item.researchRun.detectionResult.pass, true);
  for (const artifact of review.getResearchArtifacts(item.researchRun)) {
    const selected = review.resolveReviewCanvasSource({ ...item, selectedReviewArtifactId: artifact.artifactPath });
    assert.equal(selected.url, artifact.url);
    assert.equal(selected.sourceSha256, sourceSha256);
    assert.equal(selected.reviewOnly, true);
  }
});
