const SHA256 = /^[a-f0-9]{64}$/i;

function validBounds(bounds) {
  return Boolean(bounds)
    && Number.isFinite(Number(bounds.x))
    && Number.isFinite(Number(bounds.y))
    && Number(bounds.width) > 0
    && Number(bounds.height) > 0;
}

function validFieldEvidence(field) {
  return validBounds(field?.bounds)
    && SHA256.test(String(field?.cropSha256 || ""))
    && Object.prototype.hasOwnProperty.call(field || {}, "rawOcr")
    && Number.isFinite(Number(field?.confidence))
    && field?.review_status === "review_required";
}

export function auditTraceCandidates(candidates = []) {
  const normalized = Array.isArray(candidates) ? candidates : [];
  const fields = normalized.flatMap((candidate) => Array.isArray(candidate?.fieldCrops) ? candidate.fieldCrops : []);
  const completeFields = fields.filter(validFieldEvidence).length;
  const sourceSha256Present = normalized.filter((candidate) => SHA256.test(String(
    candidate?.sourceSha256 || candidate?.source?.sha256 || "",
  ))).length;
  const reviewRequiredCandidates = normalized.filter((candidate) => candidate?.needsReview === true && candidate?.isConfirmed !== true).length;
  return {
    candidateCount: normalized.length,
    fieldCount: fields.length,
    sourceSha256Present,
    completeFieldEvidence: completeFields,
    reviewRequiredCandidates,
    passed: normalized.length > 0
      && sourceSha256Present === normalized.length
      && completeFields === fields.length
      && reviewRequiredCandidates === normalized.length,
  };
}
