const SHA256_PATTERN = /^[a-f\d]{64}$/iu;

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

function assertBbox(bbox) {
  if (bbox == null) return;
  const fields = [bbox.x, bbox.y, bbox.width, bbox.height];
  if (fields.some((value) => !Number.isFinite(value)) || bbox.width <= 0 || bbox.height <= 0) {
    throw new TypeError("bbox must contain finite x/y and positive width/height");
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
  assertBbox(bbox);
  if (stream !== "A" && stream !== "B") throw new TypeError('stream must be "A" or "B"');
  if (!["original_reference", "full_image_variant", "slip_crop_original", "slip_crop_variant"].includes(artifactType)) {
    throw new TypeError("artifactType is not supported by the dual-stream contract");
  }
  if (artifactType === "original_reference") {
    if (stream !== "A" || parentArtifact !== null || artifactSha256.toLowerCase() !== sourceSha256.toLowerCase()) {
      throw new TypeError("original_reference must point to the source hash in Stream A without a parent");
    }
  } else {
    if (artifactPath === sourceFileName) throw new TypeError("derived artifact path must not overwrite the source file");
    if (artifactType.startsWith("slip_crop") && stream !== "B") {
      throw new TypeError("slip crop artifacts must belong to Stream B");
    }
    if (artifactType === "full_image_variant" && stream !== "A") {
      throw new TypeError("full-image variants must belong to Stream A");
    }
  }
  if (typeof reviewOnly !== "boolean") throw new TypeError("reviewOnly must be a boolean");
  if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
    throw new TypeError("transform must be an object");
  }

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
