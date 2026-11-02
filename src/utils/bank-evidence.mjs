const BANK_ALIASES = [
  /กรุงไทย|krungthai/i,
  /กสิกรไทย|kasikorn/i,
  /กรุงเทพ|bangkok\s*bank/i,
  /ไทยพาณิชย์|\bscb\b/i,
  /กรุงศรี|krungsri/i,
  /ทหารไทยธนชาต|ทีเอ็มบีธนชาต|\bttb\b/i,
  /ออมสิน|\bgsb\b/i,
];

/** @typedef {{ text?: string, confidence?: number, bounds?: { x: number, y: number, width: number, height: number } | null }} BankEvidenceBox */

export function isKnownBankText(text) {
  return BANK_ALIASES.some((pattern) => pattern.test(text || ""));
}

/**
 * @param {{ structuredBank?: string | null, structuredConfidence?: number, boxes?: BankEvidenceBox[] }} input
 */
export function resolveBankTextEvidence({ structuredBank, structuredConfidence = 0, boxes = [] }) {
  const bankLine = [...boxes]
    .filter((box) => /ธนาคาร|^\s*ธ.{1,8}\s*$|กรุงไทย|กสิกร|กรุงเทพ|ไทยพาณิชย์|กรุงศรี|ทหารไทย|ttb|gsb|bank/i.test(box.text || ""))
    .sort((left, right) => (right.confidence || 0) - (left.confidence || 0))[0] || null;
  const knownBank = bankLine && isKnownBankText(bankLine.text);
  const hasTextEvidence = Boolean(knownBank || (structuredBank && bankLine));
  return {
    value: structuredBank || (knownBank ? bankLine.text.trim() : null),
    rawOcr: bankLine?.text || null,
    confidence: hasTextEvidence
      ? Math.max(structuredConfidence || 0, bankLine?.confidence || 0)
      : 0,
    bounds: bankLine?.bounds || null,
    hasTextEvidence,
    status: hasTextEvidence ? "pass" : "review_required",
  };
}
