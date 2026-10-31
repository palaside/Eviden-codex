import { createArtifactRecord, createResearchRunManifest, evaluateDetectionGate } from "./dual-stream-enhancement.mjs";

export function getResearchArtifacts(run) {
  return [
    ...(run?.streamA?.artifacts || []),
    ...(run?.streamB?.slips || []).flatMap((slip) => [slip.cropOriginal, ...(slip.cropVariants || [])]),
  ].filter(Boolean);
}

// Only embedded raster images and same-origin artifact paths are durable previews.
function durableImageUrl(url) {
  return typeof url === "string" && (/^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/=\s]+$/iu.test(url)
    || /^\/[^/\\]/u.test(url) && !/[\\\r\n]/u.test(url));
}

export function attachResearchRun(item, run, sourceSha256) {
  if (run?.reviewOnly !== true) throw new Error("Research run must be review-only");
  const locked = createResearchRunManifest({ sourceFileName: run.source?.fileName, sourceSha256: run.source?.sha256, sourceDimensions: run.source?.dimensions, expectedSlipCount: run.expectedSlipCount });
  if (locked.source.sha256 !== sourceSha256?.toLowerCase()
    || item.meta?.sha256 && item.meta.sha256.toLowerCase() !== locked.source.sha256
    || item.file && item.file.name !== locked.source.fileName) throw new Error("Research source does not match the original file");
  const next = structuredClone(run);
  const seen = new Set();
  for (const artifact of getResearchArtifacts(next)) {
    createArtifactRecord(artifact);
    if (artifact.sourceSha256 !== locked.source.sha256 || artifact.sourceFileName !== locked.source.fileName) throw new Error("Artifact source provenance mismatch");
    if (artifact.reviewOnly !== true) throw new Error("Artifact must be review-only");
    if (seen.has(artifact.artifactPath)) throw new Error("Duplicate research artifact ID");
    seen.add(artifact.artifactPath);
    if (!durableImageUrl(artifact.url)) delete artifact.url;
  }
  for (const detection of next.streamB.detections) {
    const b = detection.bbox;
    if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)
      || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0
      || b.x + b.width > locked.source.dimensions.width || b.y + b.height > locked.source.dimensions.height) throw new Error("Detection bbox outside source image");
  }
  next.detectionResult = evaluateDetectionGate({ expectedSlipCount: next.expectedSlipCount, detectedCount: next.streamB.detections.length });
  return { ...item, researchRun: next, selectedReviewArtifactId: "original" };
}

export function resolveReviewCanvasSource(item) {
  const run = item?.researchRun;
  const sourceSha256 = item?.meta?.sha256 || run?.source?.sha256 || null;
  const base = { url: item?.previewUrl || null, sourceKind: "original", stream: null, variant: "original", reviewOnly: true, sourceSha256, detections: [] };
  const id = item?.selectedReviewArtifactId;
  if (id === "original") return base;
  const validRun = run?.reviewOnly === true && run.source?.sha256 === sourceSha256;
  if (id === "detected-overlay") return validRun ? { ...base, sourceKind: "detected-overlay", variant: "detected-overlay", detections: run.streamB.detections } : base;
  if (id) {
    const artifact = validRun && getResearchArtifacts(run).find((record) => record.artifactPath === id);
    if (!artifact || artifact.reviewOnly !== true || artifact.sourceSha256 !== sourceSha256 || !durableImageUrl(artifact.url)) return base;
    return { ...base, url: artifact.url, sourceKind: artifact.artifactType === "original_reference" ? "original" : "derived", stream: artifact.stream, variant: artifact.variant || artifact.artifactPath.split("/").pop(), artifactId: artifact.artifactPath };
  }
  const legacyUrl = item?.reviewPreviewUrl;
  return durableImageUrl(legacyUrl) || typeof legacyUrl === "string" && legacyUrl.startsWith("blob:")
    ? { ...base, url: legacyUrl, sourceKind: "derived", variant: "Upscayl" } : base;
}

export function formatReviewCanvasLabel(source) {
  const slip = source.artifactId?.match(/slip-\d+/u)?.[0];
  const label = source.sourceKind === "original" ? "ต้นฉบับ"
    : source.sourceKind === "detected-overlay" ? "ต้นฉบับ · กรอบตรวจพบสลิป"
      : `Derived · ${source.stream ? `Stream ${source.stream} · ` : ""}${slip ? `${slip} · ` : ""}${source.variant}`;
  return `${label} · review-only`;
}

export function prepareResearchQueueForPersistence(queue) {
  return queue.map(({ processingFile, ...item }) => {
    void processingFile;
    const next = { ...item };
    if (!durableImageUrl(next.reviewPreviewUrl)) delete next.reviewPreviewUrl;
    if (next.researchRun) {
      next.researchRun = structuredClone(next.researchRun);
      for (const artifact of getResearchArtifacts(next.researchRun)) {
        if (!durableImageUrl(artifact.url)) delete artifact.url;
      }
    }
    return next;
  });
}

/**
 * Select the visual source for review without changing the chain-of-custody source.
 * The original preview remains the fallback and is always retained separately.
 */
export function getReviewPreviewSource(item) {
  return resolveReviewCanvasSource(item).url;
}
