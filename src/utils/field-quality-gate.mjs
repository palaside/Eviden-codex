const hasText = (value) => typeof value === "string" && value.trim().length > 0;

export function assessFieldQuality({
  field,
  value = null,
  rawOcr = null,
  confidence = 0,
  bounds,
  sourceDimensions,
  alternatives = [],
  groundTruth = null,
} = {}) {
  const validBounds = Boolean(bounds && bounds.width > 0 && bounds.height > 0);
  const insideSource = validBounds && (!sourceDimensions || (
    bounds.x >= 0 && bounds.y >= 0
      && bounds.x + bounds.width <= sourceDimensions.width
      && bounds.y + bounds.height <= sourceDimensions.height
  ));
  const visualQuality = validBounds && bounds.width >= 12 && bounds.height >= 8 ? "pass" : "review_required";
  const regionQuality = insideSource ? "pass" : "fail";
  const conflict = new Set(alternatives.filter(hasText).map((item) => item.trim().toLocaleLowerCase())).size > 1;
  const recognitionQuality = conflict ? "conflict" : hasText(value) && confidence >= 0.8 ? "pass" : "review_required";
  const exactCandidate = hasText(groundTruth)
    && hasText(value)
    && value.trim() === groundTruth.trim()
    && visualQuality === "pass"
    && regionQuality === "pass"
    && recognitionQuality === "pass";
  return {
    field,
    value: value ?? null,
    rawOcr: rawOcr ?? null,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    alternatives: [...alternatives],
    ground_truth: groundTruth ?? null,
    exact_candidate: exactCandidate,
    certification_status: exactCandidate ? "exact_candidate" : "review_required",
    visual_quality: visualQuality,
    region_quality: regionQuality,
    recognition_quality: recognitionQuality,
    conflict,
    review_status: "review_required",
    trusted: regionQuality === "pass" && recognitionQuality === "pass" && visualQuality === "pass" ? false : false,
  };
}

/** @param {Array<Record<string, any>>} fields @param {{requiredFields?: string[]}} options */
export function fieldQualitySummary(fields = [], { requiredFields = [] } = {}) {
  const presentFields = new Set(fields.map((field) => field.field));
  const missingRequiredField = requiredFields.some((field) => !presentFields.has(field));
  return {
    visual_quality: !missingRequiredField && fields.every((field) => field.visual_quality === "pass") ? "pass" : "review_required",
    region_quality: !missingRequiredField && fields.every((field) => field.region_quality === "pass") ? "pass" : "review_required",
    recognition_quality: fields.some((field) => field.recognition_quality === "conflict")
      ? "conflict"
      : !missingRequiredField && fields.every((field) => field.recognition_quality === "pass") ? "pass" : "review_required",
    review_status: "review_required",
    exact_candidate: !missingRequiredField && fields.length > 0 && fields.every((field) => field.exact_candidate === true),
    certification_status: !missingRequiredField && fields.length > 0 && fields.every((field) => field.exact_candidate === true)
      ? "exact_candidate"
      : "review_required",
  };
}
