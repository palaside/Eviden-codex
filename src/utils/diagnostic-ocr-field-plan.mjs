function validBounds(bounds, dimensions) {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;
  if (bounds.width <= 0 || bounds.height <= 0 || bounds.x < 0 || bounds.y < 0) return false;
  return !dimensions || (bounds.x + bounds.width <= dimensions.width && bounds.y + bounds.height <= dimensions.height);
}

function normalizedConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

/**
 * Returns review-only OCR observations when a bank template cannot be chosen.
 * They preserve what the local OCR actually saw; they never assign a business
 * field or manufacture a value from an unknown-bank slip.
 */
export function buildDiagnosticOcrFieldPlan(trace, dimensions, { limit = 24 } = {}) {
  const observed = new Map();
  for (const attempt of trace?.attempts || []) {
    for (const line of attempt?.lines || []) {
      const text = typeof line?.text === "string" ? line.text.trim() : "";
      if (!text || !validBounds(line.bounds, dimensions)) continue;
      const bounds = {
        x: Math.floor(line.bounds.x), y: Math.floor(line.bounds.y),
        width: Math.ceil(line.bounds.width), height: Math.ceil(line.bounds.height),
      };
      const key = `${text}\u0000${bounds.x}\u0000${bounds.y}\u0000${bounds.width}\u0000${bounds.height}`;
      const candidate = {
        text,
        rawOcr: text,
        confidence: normalizedConfidence(line.confidence),
        bounds,
        classification: "uncertain",
        supportsFields: [],
      };
      const previous = observed.get(key);
      if (!previous || candidate.confidence > previous.confidence) observed.set(key, candidate);
    }
  }
  return [...observed.values()]
    .sort((left, right) => right.confidence - left.confidence || left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x)
    .slice(0, limit)
    .map((ocrBox, index) => ({
      field: `diagnostic_ocr_${String(index + 1).padStart(2, "0")}`,
      source: "diagnostic_ocr_line",
      bounds: ocrBox.bounds,
      ocrBox,
      alternatives: [],
    }));
}
