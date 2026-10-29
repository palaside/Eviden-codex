export function shouldBuildChatEvidenceLayers(jobKind) {
  return jobKind === "CHAT";
}

function isHighConfidenceStructuredSlipRegion(region) {
  if (!(typeof region.amount === "number" && Number.isFinite(region.amount) && region.amount > 0)
    || region.amountConfidence < 0.85
    || typeof region.bankName !== "string"
    || !region.bankName.trim()
    || region.bankConfidence < 0.8
    || typeof region.referenceNo !== "string"
    || region.referenceNo.replace(/[^\p{L}\p{N}]/gu, "").length < 10
    || region.referenceConfidence < 0.8
    || typeof region.date !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/u.test(region.date)
    || region.dateConfidence < 0.8
    || typeof region.time !== "string"
    || !/^\d{2}:\d{2}$/u.test(region.time)
    || region.timeConfidence < 0.8
    || typeof region.rawText !== "string") return false;

  const normalized = region.rawText.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
  return /โอนเงิน.{0,8}(?:เร็จ|เรือ)|โอน.{0,8}ส[ํำ]าเร็จ|transfer.{0,12}success/u.test(normalized)
    && /(?:รหัส|เลขที่)อ้างอ.{0,2}ง|reference|transactionid/u.test(normalized);
}

function isStrongPartialSlipRegion(region) {
  if (!(typeof region.amount === "number" && Number.isFinite(region.amount) && region.amount > 0)
    || typeof region.rawText !== "string") return false;

  const normalized = region.rawText.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
  const hasReferenceCue = /(?:รหัส|เลขที่)อ้างอ.{0,2}ง|reference|transactionid/u.test(normalized);
  const hasSuccessCue = /โอนเงิน.{0,8}(?:เร็จ|เรือ)|โอน.{0,8}ส[ํำ]าเร็จ|transfer.{0,12}success/u.test(normalized);
  // A focused OCR crop is stronger evidence than a noisy full-page reference.
  // Keep it review-only, but do not discard a visible slip merely because OCR
  // shortened the reference number.
  if (region.visualCropEvidence === true
    && hasSuccessCue
    && region.amountConfidence >= 0.55
    && (region.bankName || region.date || region.senderName || region.receiverName)) return true;
  if (typeof region.referenceNo !== "string"
    || region.referenceNo.replace(/[^\p{L}\p{N}]/gu, "").length < 14
    || region.referenceConfidence < 0.8) return false;
  if (!hasReferenceCue) return false;
  if (hasSuccessCue) return true;

  const hasLabeledBahtAmount = /(?:[จขอ][ํำ]านวน(?:เง[ิี]?น|เว[ิี]น)|ยอดเงิน|amount)/u.test(normalized)
    && /(?:บาท|thb|฿)/u.test(normalized);
  if (!hasLabeledBahtAmount) return false;
  if (region.amountConfidence >= 0.7) {
    const hasBankContext = typeof region.bankName === "string"
      && !!region.bankName.trim()
      && region.bankConfidence >= 0.75;
    const hasDateTimeContext = typeof region.date === "string"
      && /^\d{4}-\d{2}-\d{2}$/u.test(region.date)
      && typeof region.time === "string"
      && /^\d{2}:\d{2}$/u.test(region.time);
    return hasBankContext || hasDateTimeContext;
  }

  // A low-confidence grouped OCR line needs multiple independent fields before it can enter review.
  const hasBankContext = typeof region.bankName === "string"
    && !!region.bankName.trim()
    && region.bankConfidence >= 0.8;
  const hasDateTimeContext = typeof region.date === "string"
    && /^\d{4}-\d{2}-\d{2}$/u.test(region.date)
    && region.dateConfidence >= 0.8
    && typeof region.time === "string"
    && /^\d{2}:\d{2}$/u.test(region.time)
    && region.timeConfidence >= 0.8;
  if (!hasBankContext || !hasDateTimeContext) return false;
  return true;
}

function isVisualCropSlipRegion(region) {
  if (region.visualCropEvidence !== true
    || !(typeof region.amount === "number" && Number.isFinite(region.amount) && region.amount > 0)
    || region.amountConfidence < 0.55) return false;
  if (typeof region.rawText !== "string") return true;
  const normalized = region.rawText.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
  const hasTransferCue = /โอนเงิน|transfer|success/u.test(normalized);
  const hasAmountCue = /จ[ํำ]านวนเงิน|ยอดเงิน|amount|บาท|thb/u.test(normalized);
  return (hasTransferCue && hasAmountCue
    && (region.bankName || region.date || region.senderName || region.receiverName))
    || Boolean(region.referenceNo || region.senderName || region.receiverName);
}

/**
 * @template {{ bounds: { x0: number; y0: number; x1: number; y1: number } }} T
 * @param {T[]} regions
 * @param {{ jobKind: "CHAT" | "SLIP"; visualCandidates?: Array<{ objectTypeCandidate?: string; confidence?: number; bounds: { x: number; y: number; width: number; height: number } }>; qrCandidates?: Array<{ bounds: { x: number; y: number; width: number; height: number } }> }} options
 * @returns {T[]}
 */
export function filterTextOnlySlipRegionsForJob(regions, {
  jobKind,
  visualCandidates = [],
  qrCandidates = [],
}) {
  if (jobKind !== "CHAT") return regions;

  return regions.filter((region) => {
    const { x0, y0, x1, y1 } = region.bounds;
    const hasQrAnchor = qrCandidates.some(({ bounds }) => {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      return centerX >= x0 && centerX <= x1 && centerY >= y0 && centerY <= y1;
    });
    if (hasQrAnchor) return true;

    const hasSlipLikeOcr = isHighConfidenceStructuredSlipRegion(region)
      || isStrongPartialSlipRegion(region)
      || isVisualCropSlipRegion(region);
    if (!hasSlipLikeOcr) return false;
    const regionArea = Math.max(1, (x1 - x0) * (y1 - y0));
    return visualCandidates.some(({ objectTypeCandidate, confidence, bounds }) => {
      const overlapWidth = Math.max(0, Math.min(x1, bounds.x + bounds.width) - Math.max(x0, bounds.x));
      const overlapHeight = Math.max(0, Math.min(y1, bounds.y + bounds.height) - Math.max(y0, bounds.y));
      const overlapRatio = overlapWidth * overlapHeight / regionArea;
      if (isVisualCropSlipRegion(region)) return overlapRatio >= 0.5;
      if (/^image(?:_|$)/u.test(objectTypeCandidate || "")) {
        // Color-mask contours can misclassify a large chat bubble as an image.
        // A low-confidence heuristic object is not sufficient evidence for a
        // no-QR OCR candidate; keep it reviewable in the trace instead.
        return overlapRatio >= 0.5
          && (confidence == null || confidence >= 0.65 || region.visualCropEvidence === true);
      }
      // A text bubble is normally context evidence only. Preserve a strong,
      // review-only slip-shaped OCR region when it carries a masked account
      // token and the contour covers most of the OCR region; the candidate is
      // still never auto-confirmed. Visual crops are handled above.
      const accountEvidence = [region.senderAccount, region.receiverAccount]
        .some((account) => typeof account === "string" && /[xX*]{2,}/u.test(account));
      return overlapRatio >= 0.75 && accountEvidence;
    });
  });
}
