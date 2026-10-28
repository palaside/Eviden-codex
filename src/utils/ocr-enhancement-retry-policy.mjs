export function shouldRetryOcrWithEnhancement(confidence, lineCount) {
  return !Number.isFinite(confidence) || confidence < 55 || lineCount === 0;
}

export function shouldRetryRecipientName(name, confidence) {
  return !name || !Number.isFinite(confidence) || confidence < 0.95;
}

export function selectRecipientRetryResult(originalName, originalConfidence, retryName, retryConfidence) {
  const retry = typeof retryName === "string" ? retryName.trim() : "";
  const original = typeof originalName === "string" ? originalName.trim() : "";
  if (!retry) return { name: original || null, confidence: original ? originalConfidence : 0, conflict: false };
  if (!original) return { name: retry, confidence: retryConfidence, conflict: false };
  if (retry.replace(/\s+/gu, " ") === original.replace(/\s+/gu, " ")) {
    return retryConfidence > originalConfidence
      ? { name: retry, confidence: retryConfidence, conflict: false }
      : { name: original, confidence: originalConfidence, conflict: false };
  }
  return Number.isFinite(retryConfidence) && retryConfidence >= originalConfidence + 0.05
    ? { name: retry, confidence: retryConfidence, conflict: true }
    : { name: original, confidence: originalConfidence, conflict: true };
}

export function formatOcrRetryDiagnostic({ scope, trigger, accepted, originalConfidence, enhancedConfidence }) {
  const result = accepted ? "เลือกผล OCR หลังปรับภาพ" : "คงผล OCR ต้นฉบับ";
  const reason = trigger === "missing fields" ? "พบช่องสำคัญขาด" : "ความเชื่อมั่นต่ำหรือไม่พบบรรทัด";
  const location = scope === "QR crop" ? "กรอบ QR" : "ทั้งหน้า";
  const formatConfidence = (value) => Number.isFinite(value) ? `${Math.round(value)}%` : "ไม่ทราบ";
  return `OCR retry (${location}): ${reason}; ${result} (${formatConfidence(originalConfidence)} -> ${formatConfidence(enhancedConfidence)}). โปรดตรวจทาน`;
}

export function shouldUseEnhancedOcrResult(originalConfidence, enhancedConfidence, enhancedLineCount) {
  return enhancedLineCount > 0
    && Number.isFinite(enhancedConfidence)
    && (!Number.isFinite(originalConfidence) || enhancedConfidence >= originalConfidence + 5);
}

const KEY_SLIP_FIELDS = [
  "amount",
  "date",
  "time",
  "referenceNo",
  "bankName",
  "senderName",
  "receiverName",
  "senderAccount",
  "receiverAccount",
];

function isPresent(value) {
  return value != null && (typeof value !== "string" || value.trim() !== "");
}

function coverageScore(regions) {
  return regions.reduce((best, region) => Math.max(best,
    KEY_SLIP_FIELDS.filter((field) => isPresent(region[field])).length), 0);
}

export function shouldRetryOcrForMissingSlipFields(regions, fieldRetryAttempted = false, hasQrAnchor = false) {
  if (fieldRetryAttempted) return false;
  if (hasQrAnchor && regions.length === 0) return true;
  return regions.some((region) => {
    const hasSlipAnchor = isPresent(region.amount) || isPresent(region.referenceNo) || isPresent(region.bankName);
    const missingCount = KEY_SLIP_FIELDS.filter((field) => !isPresent(region[field])).length;
    return hasSlipAnchor && missingCount >= 3;
  });
}

export function shouldUseEnhancedOcrForSlipFields(
  originalRegions,
  enhancedRegions,
  originalConfidence,
  enhancedConfidence,
  enhancedLineCount,
) {
  return enhancedLineCount > 0
    && enhancedRegions.length > 0
    && coverageScore(enhancedRegions) > coverageScore(originalRegions)
    && Number.isFinite(enhancedConfidence)
    && (coverageScore(originalRegions) === 0
      || !Number.isFinite(originalConfidence)
      || enhancedConfidence >= originalConfidence - 10);
}

/**
 * @param {Object} decision
 * @param {"QR crop"|"full page"} decision.scope
 * @param {"missing-fields"|"low-confidence"} decision.trigger
 * @param {Array<{amount?: number|null, date?: string|null, time?: string|null, referenceNo?: string|null, bankName?: string|null, senderName?: string|null, receiverName?: string|null, senderAccount?: string|null, receiverAccount?: string|null}>} [decision.originalRegions]
 * @param {Array<{amount?: number|null, date?: string|null, time?: string|null, referenceNo?: string|null, bankName?: string|null, senderName?: string|null, receiverName?: string|null, senderAccount?: string|null, receiverAccount?: string|null}>} [decision.enhancedRegions]
 * @param {number} decision.originalConfidence
 * @param {number} decision.enhancedConfidence
 * @param {number} decision.enhancedLineCount
 */
export function evaluateEnhancedOcrRetry({
  scope,
  trigger,
  originalRegions = [],
  enhancedRegions = [],
  originalConfidence,
  enhancedConfidence,
  enhancedLineCount,
}) {
  const accepted = trigger === "missing-fields"
    ? shouldUseEnhancedOcrForSlipFields(
      originalRegions,
      enhancedRegions,
      originalConfidence,
      enhancedConfidence,
      enhancedLineCount,
    )
    : shouldUseEnhancedOcrResult(originalConfidence, enhancedConfidence, enhancedLineCount);
  const diagnostic = formatOcrRetryDiagnostic({
    scope,
    trigger: trigger === "missing-fields" ? "missing fields" : "low confidence or no text",
    accepted,
    originalConfidence,
    enhancedConfidence,
  });
  return { accepted, diagnostic };
}
