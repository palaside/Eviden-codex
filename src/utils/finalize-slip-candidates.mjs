import { combineQrAndOcrSlipCandidates } from "./supplement-qr-candidates.ts";
import { normalizeSlipCandidateNames } from "./normalize-slip-candidate-names.ts";
import { applyMissingSlipReviewWarnings } from "./slip-ocr-analysis.ts";

function normalizedReference(candidate) {
  const value = candidate.data?.transaction?.reference_no;
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLocaleUpperCase();
  return /^(?:CHAT|SLIP)\d*$/u.test(normalized) ? "" : normalized;
}

function sameImageRegion(left, right) {
  const a = left.bounds;
  const b = right.bounds;
  if (![a?.x, a?.y, a?.width, a?.height, b?.x, b?.y, b?.width, b?.height].every(Number.isFinite)
    || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height / Math.min(a.width * a.height, b.width * b.height) >= 0.9;
}

function hasConflictingFields(left, right) {
  const fields = [
    left.data.transaction.amount === right.data.transaction.amount ? null : [left.data.transaction.amount, right.data.transaction.amount],
    left.data.transaction.date === right.data.transaction.date ? null : [left.data.transaction.date, right.data.transaction.date],
    left.data.transaction.time === right.data.transaction.time ? null : [left.data.transaction.time, right.data.transaction.time],
    left.data.sender.name === right.data.sender.name ? null : [left.data.sender.name, right.data.sender.name],
    left.data.sender.account_no === right.data.sender.account_no ? null : [left.data.sender.account_no, right.data.sender.account_no],
    left.data.receiver.name === right.data.receiver.name ? null : [left.data.receiver.name, right.data.receiver.name],
    left.data.receiver.account_no === right.data.receiver.account_no ? null : [left.data.receiver.account_no, right.data.receiver.account_no],
    left.data.bank.name === right.data.bank.name ? null : [left.data.bank.name, right.data.bank.name],
  ];
  return fields.some((field) => field && field[0] != null && field[1] != null);
}

function mergeRepeatedDetection(kept, duplicate) {
  const data = kept.data;
  const other = duplicate.data;
  return {
    ...kept,
    ocrTextBoxes: [...(kept.ocrTextBoxes || []), ...(duplicate.ocrTextBoxes || [])],
    ocrDiagnosticTrace: kept.ocrDiagnosticTrace ?? duplicate.ocrDiagnosticTrace,
    data: {
      ...data,
      transaction: { ...data.transaction, ...Object.fromEntries(Object.entries(other.transaction || {}).filter(([key, value]) => data.transaction?.[key] == null && value != null)) },
      sender: { ...data.sender, ...Object.fromEntries(Object.entries(other.sender || {}).filter(([key, value]) => data.sender?.[key] == null && value != null)) },
      receiver: { ...data.receiver, ...Object.fromEntries(Object.entries(other.receiver || {}).filter(([key, value]) => data.receiver?.[key] == null && value != null)) },
      bank: { ...data.bank, ...Object.fromEntries(Object.entries(other.bank || {}).filter(([key, value]) => data.bank?.[key] == null && value != null)) },
      confidence: { ...other.confidence, ...data.confidence },
      raw_text: [...new Set([...(data.raw_text || []), ...(other.raw_text || [])])],
      warnings: [...new Set([...(data.warnings || []), ...(other.warnings || []), "พบการตรวจจับซ้ำที่ Ref และบริเวณภาพเดียวกัน; รวมผลเป็น candidate เดียวโดยไม่ยืนยันธุรกรรม"])],
    },
  };
}

function consolidateSameRegionDetections(candidates) {
  const consolidated = [];
  for (const candidate of candidates) {
    const reference = normalizedReference(candidate);
    const duplicateIndex = reference ? consolidated.findIndex((kept) => normalizedReference(kept) === reference
      && sameImageRegion(kept, candidate)
      && !hasConflictingFields(kept, candidate)) : -1;
    if (duplicateIndex < 0) {
      consolidated.push(candidate);
      continue;
    }
    const kept = consolidated[duplicateIndex];
    const completeness = (item) => [
      item.data.transaction.date, item.data.transaction.time, item.data.transaction.amount,
      item.data.sender.name, item.data.sender.account_no, item.data.receiver.name, item.data.receiver.account_no,
    ].filter((value) => value != null && value !== "").length;
    const primary = completeness(candidate) > completeness(kept) ? candidate : kept;
    const secondary = primary === candidate ? kept : candidate;
    consolidated[duplicateIndex] = mergeRepeatedDetection(primary, secondary);
  }
  return consolidated;
}

export function finalizeSlipCandidates(qrCandidates, ocrCandidates) {
  return consolidateSameRegionDetections(combineQrAndOcrSlipCandidates(qrCandidates, ocrCandidates))
    .map(normalizeSlipCandidateNames)
    .map((candidate) => ({ ...candidate, data: applyMissingSlipReviewWarnings(candidate.data) }));
}
