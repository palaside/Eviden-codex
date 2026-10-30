import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createArtifactRecord } from "./dual-stream-enhancement.mjs";
import { createFullImageVariants } from "./dual-stream-full-image.mjs";

const SOURCE_BYTES = Uint8Array.from([0x53, 0x52, 0x43, 0x00, 0x01]);
const SOURCE_SHA256 = createHash("sha256").update(SOURCE_BYTES).digest("hex");

function makePixels() {
  return new Uint8ClampedArray([
    20, 30, 40, 255, 80, 90, 100, 255,
    140, 150, 160, 255, 220, 230, 240, 255,
  ]);
}

function createWriter(records) {
  return async ({ bytes, artifactName, metadata }) => {
    const copiedBytes = new Uint8Array(bytes);
    records.push({ bytes: copiedBytes, artifactName, metadata });
    return createArtifactRecord({
      sourceFileName: "chatv3 (15).jpg",
      sourceSha256: metadata.sourceSha256,
      artifactPath: metadata.artifactPath,
      artifactSha256: metadata.artifactSha256,
      stream: "A",
      artifactType: metadata.artifactType,
      dimensions: metadata.dimensions,
      transform: metadata.transform,
    });
  };
}

test("creates the exact nine Stream A variants with hashes, metadata, and review-only provenance", async () => {
  const pixelBuffer = makePixels();
  const sourceSnapshot = new Uint8ClampedArray(pixelBuffer);
  const writes = [];
  const { artifacts, status } = await createFullImageVariants({
    source: { fileName: "chatv3 (15).jpg", bytes: SOURCE_BYTES },
    sourceSha256: SOURCE_SHA256,
    width: 2,
    height: 2,
    pixelBuffer,
    artifactWriter: createWriter(writes),
  });

  assert.equal(status, "success");
  assert.deepEqual(writes.map((artifact) => artifact.metadata.variant), [
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
  assert.equal(artifacts.length, 9);
  assert.equal(writes.length, 9);
  for (const [index, artifact] of artifacts.entries()) {
    assert.equal(artifact.sourceSha256, SOURCE_SHA256);
    assert.equal(artifact.stream, "A");
    assert.equal(artifact.reviewOnly, true);
    assert.equal(artifact.artifactSha256.length, 64);
    assert.ok(writes[index].bytes.length > 0, `${writes[index].artifactName} should have bytes`);
    assert.equal(writes[index].metadata.sourceSha256, SOURCE_SHA256);
    assert.equal(createHash("sha256").update(writes[index].bytes).digest("hex"), artifact.artifactSha256);
    assert.equal(writes[index].metadata.reviewOnly, true);
  }
  assert.deepEqual([...pixelBuffer], [...sourceSnapshot], "source pixel buffer must not be mutated");
  assert.deepEqual([...SOURCE_BYTES], [0x53, 0x52, 0x43, 0x00, 0x01], "source bytes must not be mutated");
  assert.equal(new Set(artifacts.map((artifact) => artifact.artifactPath)).size, 9);
  assert.equal(new Set(writes.map((artifact) => artifact.metadata.variant)).size, 9);
  assert.deepEqual(writes[0].bytes, SOURCE_BYTES, "original reference must preserve source bytes byte-for-byte");
  for (const write of writes.slice(1)) {
    assert.deepEqual([...write.bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${write.artifactName} must be PNG`);
  }
});

test("uses expected dimensions for source reference and scaled full-image variants", async () => {
  const writes = [];
  const { artifacts } = await createFullImageVariants({
    source: { fileName: "chatv3 (15).jpg", bytes: SOURCE_BYTES },
    sourceSha256: SOURCE_SHA256,
    width: 2,
    height: 2,
    pixelBuffer: makePixels(),
    artifactWriter: createWriter(writes),
  });

  assert.deepEqual(artifacts.slice(0, 3).map(({ dimensions }) => dimensions), [
    { width: 2, height: 2 },
    { width: 4, height: 4 },
    { width: 8, height: 8 },
  ]);
});

test("returns partial when an artifact writer fails but retains successful records", async () => {
  let calls = 0;
  const records = [];
  const { artifacts, status } = await createFullImageVariants({
    source: { fileName: "chatv3 (15).jpg", bytes: SOURCE_BYTES },
    sourceSha256: SOURCE_SHA256,
    width: 2,
    height: 2,
    pixelBuffer: makePixels(),
    artifactWriter: async (input) => {
      calls += 1;
      if (calls === 4) throw new Error("writer unavailable");
      return createWriter(records)(input);
    },
  });

  assert.equal(status, "partial");
  assert.equal(artifacts.length, 8);
  assert.equal(records.some(({ metadata }) => metadata.variant === "brightness-gamma"), false);
});

test("rejects a writer that mutates its metadata copy before returning the record", async () => {
  let calls = 0;
  const validWriter = createWriter([]);
  const result = await createFullImageVariants({
    source: { fileName: "chatv3 (15).jpg", bytes: SOURCE_BYTES },
    sourceSha256: SOURCE_SHA256,
    width: 2,
    height: 2,
    pixelBuffer: makePixels(),
    artifactWriter: async (input) => {
      calls += 1;
      if (calls !== 1) return validWriter(input);
      const forgedHash = "0".repeat(64);
      input.metadata.sourceSha256 = forgedHash;
      input.metadata.artifactSha256 = forgedHash;
      input.metadata.artifactPath = `source/${forgedHash}`;
      input.metadata.dimensions = { width: 99, height: 99 };
      return createArtifactRecord({
        sourceFileName: input.metadata.sourceFileName,
        sourceSha256: input.metadata.sourceSha256,
        artifactPath: input.metadata.artifactPath,
        artifactSha256: input.metadata.artifactSha256,
        stream: input.metadata.stream,
        artifactType: input.metadata.artifactType,
        dimensions: input.metadata.dimensions,
        transform: input.metadata.transform,
        reviewOnly: input.metadata.reviewOnly,
      });
    },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.artifacts.length, 8);
  assert.equal(result.artifacts.some(({ variant }) => variant === "original-reference"), false);
  assert.ok(result.artifacts.every(({ sourceSha256 }) => sourceSha256 === SOURCE_SHA256));
});

test("rejects returned records missing required provenance fields", async () => {
  for (const missingField of ["sourceFileName", "dimensions", "transform"]) {
    let calls = 0;
    const validWriter = createWriter([]);
    const result = await createFullImageVariants({
      source: { fileName: "chatv3 (15).jpg", bytes: SOURCE_BYTES },
      sourceSha256: SOURCE_SHA256,
      width: 2,
      height: 2,
      pixelBuffer: makePixels(),
      artifactWriter: async (input) => {
        calls += 1;
        const record = await validWriter(input);
        if (calls !== 1) return record;
        const incomplete = { ...record };
        delete incomplete[missingField];
        return incomplete;
      },
    });

    assert.equal(result.status, "partial", `missing ${missingField} must not report success`);
    assert.equal(result.artifacts.length, 8);
    assert.equal(result.artifacts.some(({ variant }) => variant === "original-reference"), false);
  }
});

test("rejects returned records whose dimensions or transform differ from the generated artifact", async () => {
  let calls = 0;
  const validWriter = createWriter([]);
  const result = await createFullImageVariants({
    source: { fileName: "chatv3 (15).jpg", bytes: SOURCE_BYTES },
    sourceSha256: SOURCE_SHA256,
    width: 2,
    height: 2,
    pixelBuffer: makePixels(),
    artifactWriter: async (input) => {
      calls += 1;
      const record = await validWriter(input);
      if (calls !== 1) return record;
      return { ...record, dimensions: { width: 999, height: 999 } };
    },
  });

  assert.equal(result.status, "partial");
  assert.equal(result.artifacts.length, 8);
  assert.equal(result.artifacts.some(({ variant }) => variant === "original-reference"), false);
});
