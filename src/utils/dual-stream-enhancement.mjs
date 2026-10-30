const SHA256_PATTERN = /^[a-f\d]{64}$/iu;
const LOGICAL_PATH_SEGMENT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

const STREAM_A_VARIANTS = [
  { id: "original-reference", operation: "reference", artifactType: "original_reference" },
  { id: "upscale-2x", operation: "upscale", scale: 2, artifactType: "full_image_variant" },
  { id: "upscale-4x", operation: "upscale", scale: 4, artifactType: "full_image_variant" },
  { id: "brightness-gamma", operation: "brightness_gamma", artifactType: "full_image_variant" },
  { id: "clahe", operation: "clahe", artifactType: "full_image_variant" },
  { id: "denoise", operation: "denoise", artifactType: "full_image_variant" },
  { id: "sharpen", operation: "sharpen", artifactType: "full_image_variant" },
  { id: "grayscale", operation: "grayscale", artifactType: "full_image_variant" },
  { id: "adaptive-threshold", operation: "adaptive_threshold", artifactType: "full_image_variant" },
];

const STREAM_B_VARIANTS = [
  { id: "crop-original", operation: "crop", artifactType: "slip_crop_original" },
  { id: "crop-upscale-2x", operation: "upscale", scale: 2, artifactType: "slip_crop_variant" },
  { id: "crop-upscale-4x", operation: "upscale", scale: 4, artifactType: "slip_crop_variant" },
  { id: "crop-clahe", operation: "clahe", artifactType: "slip_crop_variant" },
  { id: "crop-denoise", operation: "denoise", artifactType: "slip_crop_variant" },
  { id: "crop-sharpen", operation: "sharpen", artifactType: "slip_crop_variant" },
  { id: "crop-grayscale", operation: "grayscale", artifactType: "slip_crop_variant" },
];

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a 64-character SHA-256 hex string`);
  }
}

function assertDimensions(dimensions, label) {
  if (!dimensions || !Number.isSafeInteger(dimensions.width) || dimensions.width <= 0
    || !Number.isSafeInteger(dimensions.height) || dimensions.height <= 0) {
    throw new TypeError(`${label} dimensions must contain positive integer width and height`);
  }
}

function assertCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} count must be a non-negative safe integer`);
  }
}

function assertBbox(bbox, { requireSourceOrigin = false } = {}) {
  if (bbox == null) {
    if (requireSourceOrigin) throw new TypeError("crop artifact requires a source-coordinate bbox");
    return;
  }
  if (typeof bbox !== "object" || Array.isArray(bbox)) {
    throw new TypeError("bbox must be an object");
  }
  const fields = [bbox.x, bbox.y, bbox.width, bbox.height];
  if (fields.some((value) => !Number.isFinite(value)) || bbox.width <= 0 || bbox.height <= 0) {
    throw new TypeError("bbox must contain finite x/y and positive width/height");
  }
  if (requireSourceOrigin && (bbox.x < 0 || bbox.y < 0)) {
    throw new TypeError("crop bbox source coordinates must have non-negative x/y");
  }
}

// Artifact paths are logical IDs, never filesystem paths. Writers must map these
// namespaces to destinations and independently compare resolved paths to source.
function assertLogicalArtifactPath(value, { namespace, label }) {
  assertNonEmptyString(value, label);
  const segments = value.split("/");
  if (value !== value.trim()
    || value.includes("\\")
    || value.includes(":")
    || value.startsWith("/")
    || segments.some((segment) => !LOGICAL_PATH_SEGMENT.test(segment))
    || segments[0] !== namespace
    || value !== value.toLowerCase()) {
    throw new TypeError(`${label} must be a canonical ${namespace}/ logical path`);
  }
  return segments;
}

function assertTransform(transform, { sourceReference = false } = {}) {
  if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
    throw new TypeError("transform must be an object");
  }
  if (typeof transform.engine !== "string" || transform.engine.trim().length === 0
    || !Array.isArray(transform.operations)) {
    throw new TypeError("transform requires a non-empty engine and operations array");
  }

  if (sourceReference) {
    if (transform.engine !== "none" || transform.operations.length !== 0
      || Object.keys(transform).some((key) => key !== "engine" && key !== "operations")) {
      throw new TypeError('original_reference transform must be explicitly { engine: "none", operations: [] }');
    }
    return;
  }

  if (transform.operations.length === 0
    || transform.operations.some((operation) => typeof operation !== "string" || operation.trim().length === 0)) {
    throw new TypeError("derived transform operations must contain non-empty strings");
  }
  if (transform.operations.includes("upscale") && (!Number.isFinite(transform.scale) || transform.scale <= 1)) {
    throw new TypeError("upscale transform requires a finite scale greater than 1");
  }
}

function assertCropParent({ artifactPath, parentArtifact }) {
  const artifactSegments = assertLogicalArtifactPath(artifactPath, { namespace: "derived", label: "artifactPath" });
  const parentSegments = assertLogicalArtifactPath(parentArtifact, { namespace: "derived", label: "parentArtifact" });
  const cropParentPattern = /^slip-(?:0[1-9]|[1-9]\d*)$/u;
  if (parentSegments[1] !== "stream-b"
    || parentSegments.length !== 4
    || !cropParentPattern.test(parentSegments[2])
    || !/^crop-original\.[a-z0-9]+$/u.test(parentSegments[3])) {
    throw new TypeError("parentArtifact must identify a Stream B slip crop-original artifact");
  }
  if (artifactSegments.length !== 4
    || artifactSegments[1] !== "stream-b"
    || artifactSegments[2] !== parentSegments[2]
    || artifactSegments[3] === parentSegments[3]) {
    throw new TypeError("crop variant and parentArtifact must identify the same slip and different artifacts");
  }
}

export function createResearchRunManifest({
  sourceFileName,
  sourceSha256,
  sourceDimensions,
  expectedSlipCount = 2,
}) {
  assertNonEmptyString(sourceFileName, "sourceFileName");
  assertSha256(sourceSha256, "sourceSha256");
  assertDimensions(sourceDimensions, "source");
  assertCount(expectedSlipCount, "expectedSlipCount");

  return {
    source: {
      fileName: sourceFileName,
      sha256: sourceSha256.toLowerCase(),
      dimensions: clone(sourceDimensions),
    },
    expectedSlipCount,
    streamA: { artifacts: [], detections: [] },
    streamB: { detections: [], slips: [] },
    detectionResult: {
      expectedSlipCount,
      detectedCount: 0,
      pass: expectedSlipCount === 0,
      status: expectedSlipCount === 0 ? "pass" : "fail",
    },
    enhancementResult: { status: "not_started" },
    extractionResult: { status: "not_started" },
    reviewOnly: true,
  };
}

export function createArtifactRecord({
  sourceFileName,
  sourceSha256,
  artifactPath,
  artifactSha256,
  stream,
  artifactType,
  parentArtifact = null,
  bbox = null,
  dimensions,
  transform,
  reviewOnly = true,
}) {
  assertNonEmptyString(sourceFileName, "sourceFileName");
  assertSha256(sourceSha256, "sourceSha256");
  assertNonEmptyString(artifactPath, "artifactPath");
  assertSha256(artifactSha256, "artifactSha256");
  assertDimensions(dimensions, "artifact");
  if (stream !== "A" && stream !== "B") throw new TypeError('stream must be "A" or "B"');
  if (!["original_reference", "full_image_variant", "slip_crop_original", "slip_crop_variant"].includes(artifactType)) {
    throw new TypeError("artifactType is not supported by the dual-stream contract");
  }
  if (artifactType === "original_reference") {
    const normalizedSourceHash = sourceSha256.toLowerCase();
    if (stream !== "A" || parentArtifact !== null || artifactSha256.toLowerCase() !== normalizedSourceHash
      || artifactPath !== `source/${normalizedSourceHash}`) {
      throw new TypeError("original_reference must use its source/<sha256> logical ID, source hash, and no parent in Stream A");
    }
  } else {
    const pathSegments = assertLogicalArtifactPath(artifactPath, { namespace: "derived", label: "artifactPath" });
    if (artifactType.startsWith("slip_crop") && stream !== "B") {
      throw new TypeError("slip crop artifacts must belong to Stream B");
    }
    if (artifactType === "full_image_variant" && stream !== "A") {
      throw new TypeError("full-image variants must belong to Stream A");
    }
    if (pathSegments[1] !== `stream-${stream.toLowerCase()}`) {
      throw new TypeError("artifactPath namespace must match its stream");
    }
    if (artifactType === "full_image_variant" && pathSegments.length < 3) {
      throw new TypeError("full_image_variant requires a path below the Stream A namespace");
    }
    if (artifactType === "slip_crop_original") {
      assertBbox(bbox, { requireSourceOrigin: true });
      if (parentArtifact !== null || pathSegments.length !== 4
        || !/^slip-(?:0[1-9]|[1-9]\d*)$/u.test(pathSegments[2])
        || !/^crop-original\.[a-z0-9]+$/u.test(pathSegments[3])) {
        throw new TypeError("slip_crop_original requires its source bbox and a canonical crop-original path without a parent");
      }
    } else if (artifactType === "slip_crop_variant") {
      assertBbox(bbox, { requireSourceOrigin: true });
      if (parentArtifact == null) throw new TypeError("slip_crop_variant requires a parent crop identifier/path");
      assertCropParent({ artifactPath, parentArtifact });
    } else {
      assertBbox(bbox);
    }
  }
  if (typeof reviewOnly !== "boolean") throw new TypeError("reviewOnly must be a boolean");
  assertTransform(transform, { sourceReference: artifactType === "original_reference" });

  return {
    sourceFileName,
    sourceSha256: sourceSha256.toLowerCase(),
    artifactPath,
    artifactSha256: artifactSha256.toLowerCase(),
    stream,
    artifactType,
    parentArtifact,
    bbox: clone(bbox),
    dimensions: clone(dimensions),
    transform: clone(transform),
    reviewOnly,
  };
}

export function evaluateDetectionGate({ expectedSlipCount, detectedCount }) {
  assertCount(expectedSlipCount, "expectedSlipCount");
  assertCount(detectedCount, "detectedCount");
  const pass = detectedCount === expectedSlipCount;
  return { pass, expectedSlipCount, detectedCount, status: pass ? "pass" : "fail" };
}

export function buildVariantPlan() {
  return {
    streamA: STREAM_A_VARIANTS.map((variant) => ({ ...variant, stream: "A" })),
    streamB: STREAM_B_VARIANTS.map((variant) => ({ ...variant, stream: "B" })),
  };
}
