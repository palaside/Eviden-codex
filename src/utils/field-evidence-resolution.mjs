function normalize(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function uniqueObservations(observations) {
  const byValue = new Map();
  for (const observation of observations || []) {
    if (!observation || observation.value === null || observation.value === undefined || !String(observation.value).trim()) continue;
    const key = normalize(observation.value);
    const current = byValue.get(key);
    if (!current || Number(observation.confidence || 0) > Number(current.confidence || 0)) byValue.set(key, { ...observation });
  }
  return [...byValue.values()];
}

export function mergeFieldObservations(field, observations = [], review = {}) {
  const alternatives = uniqueObservations(observations);
  const conflict = alternatives.length > 1;
  const consensus = !conflict && alternatives[0] ? alternatives[0] : null;
  const humanValue = review.humanValue === undefined ? null : review.humanValue;
  return {
    field,
    value: humanValue ?? consensus?.value ?? null,
    ocrValue: humanValue !== null ? null : consensus?.value ?? null,
    rawText: consensus?.rawText ?? null,
    confidence: consensus?.confidence ?? 0,
    alternatives,
    observations: observations.map((observation) => ({ ...observation })),
    conflict,
    status: conflict ? "ocr_conflict" : "review",
    reviewStatus: review.humanValue !== undefined ? "human_reviewed" : "human_review_required",
    reviewedBy: review.reviewedBy || null,
    confirmed: false,
  };
}

export function validateFieldResult({ field, value, confidence, sourceBounds } = {}) {
  const errors = [];
  if (field === "amount" && !(typeof value === "number" && Number.isFinite(value) && value > 0)) errors.push("amount must be positive");
  if (!(typeof confidence === "number" && confidence >= 0 && confidence <= 1)) errors.push("confidence must be between 0 and 1");
  if (!sourceBounds || !(sourceBounds.width > 0) || !(sourceBounds.height > 0)) errors.push("sourceBounds is required");
  return { valid: errors.length === 0, errors };
}
