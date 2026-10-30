import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVariantPlan,
  createArtifactRecord,
  createResearchRunManifest,
  evaluateDetectionGate,
} from "./dual-stream-enhancement.mjs";

test("variant plan matches the approved full-image and slip-crop variants", () => {
  const plan = buildVariantPlan();

  assert.deepEqual(plan.streamA.map(({ id }) => id), [
    "original-reference",
    "upscale-2x",
    "upscale-4x",
    "brightness-gamma",
    "clahe",
    "denoise",
    "sharpen",
    "grayscale",
    "adaptive-threshold",
  ]);
  assert.deepEqual(plan.streamB.map(({ id }) => id), [
    "crop-original",
    "crop-upscale-2x",
    "crop-upscale-4x",
    "crop-clahe",
    "crop-denoise",
    "crop-sharpen",
    "crop-grayscale",
  ]);
  assert.ok(plan.streamA.every((variant) => variant.stream === "A"));
  assert.ok(plan.streamB.every((variant) => variant.stream === "B"));
});

test("research manifest starts with separate empty streams and review-only results", () => {
  const dimensions = { width: 638, height: 6260 };
  const manifest = createResearchRunManifest({
    sourceFileName: "chatv3 (15).jpg",
    sourceSha256: "a".repeat(64),
    sourceDimensions: dimensions,
  });

  assert.deepEqual(manifest, {
    source: { fileName: "chatv3 (15).jpg", sha256: "a".repeat(64), dimensions },
    expectedSlipCount: 2,
    streamA: { artifacts: [], detections: [] },
    streamB: { detections: [], slips: [] },
    detectionResult: { expectedSlipCount: 2, detectedCount: 0, pass: false, status: "fail" },
    enhancementResult: { status: "not_started" },
    extractionResult: { status: "not_started" },
    reviewOnly: true,
  });
  dimensions.width = 1;
  assert.equal(manifest.source.dimensions.width, 638, "manifest must not retain mutable input dimensions");
});

test("artifact records retain source provenance, derived hash, stream and transform metadata", () => {
  const sourceSha256 = "a".repeat(64);
  const artifactSha256 = "b".repeat(64);
  const bbox = { x: 20, y: 300, width: 200, height: 400 };
  const dimensions = { width: 400, height: 800 };
  const transform = { engine: "opencv", operations: ["upscale"], scale: 2 };
  const record = createArtifactRecord({
    sourceFileName: "chatv3 (15).jpg",
    sourceSha256,
    artifactPath: "stream-b/slip-01/upscale-2x.png",
    artifactSha256,
    stream: "B",
    artifactType: "slip_crop_variant",
    parentArtifact: "stream-b/slip-01/crop-original.png",
    bbox,
    dimensions,
    transform,
  });

  assert.deepEqual(record, {
    sourceFileName: "chatv3 (15).jpg",
    sourceSha256,
    artifactPath: "stream-b/slip-01/upscale-2x.png",
    artifactSha256,
    stream: "B",
    artifactType: "slip_crop_variant",
    parentArtifact: "stream-b/slip-01/crop-original.png",
    bbox,
    dimensions,
    transform,
    reviewOnly: true,
  });
  assert.notEqual(record.sourceSha256, record.artifactSha256, "derived artifact must have its own hash");
});

test("original-reference artifact may identify the immutable source without claiming a derived transform", () => {
  const hash = "c".repeat(64);
  const record = createArtifactRecord({
    sourceFileName: "chatv3 (15).jpg",
    sourceSha256: hash,
    artifactPath: "stream-a/original-reference.jpg",
    artifactSha256: hash,
    stream: "A",
    artifactType: "original_reference",
    parentArtifact: null,
    bbox: null,
    dimensions: { width: 638, height: 6260 },
    transform: { engine: "none", operations: [] },
  });

  assert.equal(record.sourceSha256, record.artifactSha256);
  assert.equal(record.reviewOnly, true);
});

test("detection gate passes only when detected count equals expected count", () => {
  assert.deepEqual(evaluateDetectionGate({ expectedSlipCount: 2, detectedCount: 2 }), {
    pass: true,
    expectedSlipCount: 2,
    detectedCount: 2,
    status: "pass",
  });
  assert.deepEqual(evaluateDetectionGate({ expectedSlipCount: 2, detectedCount: 1 }), {
    pass: false,
    expectedSlipCount: 2,
    detectedCount: 1,
    status: "fail",
  });
  assert.equal(evaluateDetectionGate({ expectedSlipCount: 2, detectedCount: 3 }).pass, false);
});

test("contract rejects malformed hashes, dimensions and detection counts", () => {
  assert.throws(() => createResearchRunManifest({
    sourceFileName: "x.jpg",
    sourceSha256: "not-a-hash",
    sourceDimensions: { width: 1, height: 1 },
  }), /sha256/i);
  assert.throws(() => createResearchRunManifest({
    sourceFileName: "x.jpg",
    sourceSha256: "d".repeat(64),
    sourceDimensions: { width: 0, height: 1 },
  }), /dimension/i);
  assert.throws(() => evaluateDetectionGate({ expectedSlipCount: 2, detectedCount: -1 }), /count/i);
});
