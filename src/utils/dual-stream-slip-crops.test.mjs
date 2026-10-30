import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createArtifactRecord } from "./dual-stream-enhancement.mjs";
import { createSlipCropArtifacts, normalizeDetections } from "./dual-stream-slip-crops.mjs";

const SOURCE_BYTES = Uint8Array.from([0x53, 0x52, 0x43, 0x00, 0x01]);
const SOURCE_SHA256 = createHash("sha256").update(SOURCE_BYTES).digest("hex");

function source(width = 4, height = 4) {
  const pixelBuffer = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixelBuffer.set([index * 10, index * 10, index * 10, 255], index * 4);
  }
  return { fileName: "chatv3 (15).jpg", bytes: SOURCE_BYTES, width, height, pixelBuffer };
}

function writerFor(writes, { mutateRecord = null } = {}) {
  return async ({ bytes, artifactName, metadata }) => {
    const copiedBytes = new Uint8Array(bytes);
    writes.push({ bytes: copiedBytes, artifactName, metadata: structuredClone(metadata) });
    const record = createArtifactRecord({
      ...metadata,
      artifactSha256: createHash("sha256").update(copiedBytes).digest("hex"),
    });
    return mutateRecord ? mutateRecord(record, artifactName) : record;
  };
}

test("normalizes, clips safely, and orders detections top-to-bottom while preserving source bboxes", () => {
  const detections = normalizeDetections({
    imageWidth: 4,
    imageHeight: 4,
    detections: [
      { bbox: { x: 1, y: 3, width: 2, height: 1 }, confidence: 0.8 },
      { bbox: { x: 3, y: 0, width: 2, height: 2 }, confidence: 0.9 },
      { bbox: { x: 0, y: 1, width: 2, height: 1 }, confidence: 0.7 },
    ],
  });

  assert.deepEqual(detections.map(({ index, bbox }) => ({ index, bbox })), [
    { index: 1, bbox: { x: 3, y: 0, width: 2, height: 2 } },
    { index: 2, bbox: { x: 0, y: 1, width: 2, height: 1 } },
    { index: 3, bbox: { x: 1, y: 3, width: 2, height: 1 } },
  ]);
});

test("creates two separate crop originals and all required variants with Task 1 provenance", async () => {
  const writes = [];
  const input = source();
  const snapshot = new Uint8ClampedArray(input.pixelBuffer);
  const result = await createSlipCropArtifacts({
    source: input,
    sourceSha256: SOURCE_SHA256,
    detections: [
      { bbox: { x: 0, y: 2, width: 2, height: 2 }, confidence: 0.91 },
      { bbox: { x: 2, y: 0, width: 2, height: 2 }, confidence: 0.95 },
    ],
    artifactWriter: writerFor(writes),
  });

  assert.equal(result.status, "success");
  assert.equal(result.slips.length, 2);
  assert.deepEqual(result.slips.map(({ index }) => index), [1, 2]);
  assert.deepEqual(result.slips.map(({ bbox }) => bbox), [
    { x: 2, y: 0, width: 2, height: 2 },
    { x: 0, y: 2, width: 2, height: 2 },
  ]);
  assert.ok(result.slips.every(({ reviewOnly }) => reviewOnly === true));
  assert.equal(result.slips[0].cropVariants.length, 6);
  assert.deepEqual(result.slips[0].cropVariants.map(({ variant }) => variant), [
    "crop-upscale-2x", "crop-upscale-4x", "crop-clahe", "crop-denoise", "crop-sharpen", "crop-grayscale",
  ]);
  assert.equal(writes.length, 14);
  for (const slip of result.slips) {
    assert.equal(slip.cropOriginal.artifactType, "slip_crop_original");
    assert.deepEqual(slip.cropOriginal.bbox, slip.bbox);
    for (const variant of slip.cropVariants) {
      assert.equal(variant.artifactType, "slip_crop_variant");
      assert.deepEqual(variant.bbox, slip.bbox);
      assert.equal(variant.parentArtifact, slip.cropOriginal.artifactPath);
      assert.equal(variant.reviewOnly, true);
    }
  }
  assert.deepEqual([...input.pixelBuffer], [...snapshot], "source pixels must remain immutable");
  assert.deepEqual([...input.bytes], [...SOURCE_BYTES], "source bytes must remain immutable");
});

test("clips only the crop array bounds and rejects a detection that produces an empty crop", async () => {
  const writes = [];
  const result = await createSlipCropArtifacts({
    source: source(),
    sourceSha256: SOURCE_SHA256,
    detections: [
      { bbox: { x: 3, y: 2, width: 4, height: 3 } },
      { bbox: { x: 4, y: 1, width: 2, height: 2 } },
    ],
    artifactWriter: writerFor(writes),
  });

  assert.equal(result.status, "partial");
  assert.equal(result.slips.length, 1);
  assert.deepEqual(result.slips[0].bbox, { x: 3, y: 2, width: 4, height: 3 });
  assert.deepEqual(result.slips[0].cropOriginal.dimensions, { width: 1, height: 2 });
  assert.equal(writes.length, 7);
});

test("rejects zero-area and negative or non-finite bbox origins", () => {
  for (const bbox of [
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 0, y: 0, width: 1, height: 0 },
    { x: -1, y: 0, width: 1, height: 1 },
    { x: 0, y: -1, width: 1, height: 1 },
    { x: Number.NaN, y: 0, width: 1, height: 1 },
  ]) {
    assert.throws(() => normalizeDetections({ detections: [{ bbox }], imageWidth: 4, imageHeight: 4 }), /bbox|finite|positive/i);
  }
});

test("rejects missing bbox provenance from detection records and artifact writer", async () => {
  assert.throws(() => normalizeDetections({
    detections: [{ confidence: 0.9 }], imageWidth: 4, imageHeight: 4,
  }), /bbox/i);

  const result = await createSlipCropArtifacts({
    source: source(),
    sourceSha256: SOURCE_SHA256,
    detections: [{ bbox: { x: 0, y: 0, width: 2, height: 2 } }],
    artifactWriter: writerFor([], {
      mutateRecord: (record, artifactName) => {
        if (artifactName === "crop-original") {
          const incomplete = { ...record };
          delete incomplete.bbox;
          return incomplete;
        }
        return record;
      },
    }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.slips.length, 0);
});

test("uses Task 1 count gate so one or three detections cannot report success", async () => {
  for (const count of [1, 3]) {
    const detections = Array.from({ length: count }, (_, index) => ({
      bbox: { x: 0, y: index, width: 1, height: 1 },
    }));
    const result = await createSlipCropArtifacts({
      source: source(),
      sourceSha256: SOURCE_SHA256,
      detections,
      artifactWriter: writerFor([]),
    });
    assert.equal(result.status, "partial", `${count} detection(s) must fail the expected-two gate`);
    assert.equal(result.slips.length, count);
  }
});

test("fails closed when the source digest does not match source bytes", async () => {
  await assert.rejects(createSlipCropArtifacts({
    source: source(),
    sourceSha256: "f".repeat(64),
    detections: [],
    artifactWriter: writerFor([]),
  }), /sourceSha256/i);
});
