function referenceOf(record) {
  const value = record.data?.transaction?.reference_no;
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLocaleUpperCase();
  return /^(?:CHAT|SLIP)\d*$/u.test(normalized) ? "" : normalized;
}

function referenceEditDistanceAtMostOne(left, right) {
  if (!left || !right || Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
}

function overlapsSameRegion(left, right) {
  const a = left.sourceBounds;
  const b = right.sourceBounds;
  if (![a?.x, a?.y, a?.width, a?.height, b?.x, b?.y, b?.width, b?.height].every(Number.isFinite)
    || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height / Math.min(a.width * a.height, b.width * b.height) >= 0.9;
}

function conflicts(left, right) {
  const pairs = [
    [left.data?.transaction?.amount, right.data?.transaction?.amount],
    [left.data?.transaction?.date, right.data?.transaction?.date],
    [left.data?.transaction?.time, right.data?.transaction?.time],
    [left.data?.sender?.name, right.data?.sender?.name],
    [left.data?.sender?.account_no, right.data?.sender?.account_no],
    [left.data?.receiver?.name, right.data?.receiver?.name],
    [left.data?.receiver?.account_no, right.data?.receiver?.account_no],
    [left.data?.bank?.name, right.data?.bank?.name],
  ];
  return pairs.some(([a, b]) => a != null && b != null && a !== b);
}

function isQrOnlyReference(record) {
  const data = record.data || {};
  const reference = referenceOf(record);
  const rawText = Array.isArray(data.raw_text) ? data.raw_text.join(" ") : "";
  return (data.transaction?.amount == null || data.transaction.amount === "")
    && !!reference
    && /(?:^|\s)00\d{2}00\d{2}/u.test(rawText)
    && rawText.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLocaleUpperCase().includes(reference);
}

function sameSourcePage(left, right) {
  return left.sourceItemId === right.sourceItemId
    && Number.isInteger(left.chatPageNumber)
    && left.chatPageNumber === right.chatPageNumber;
}

function hasStructuredSlipEvidence(record) {
  const data = record.data || {};
  const rawText = Array.isArray(data.raw_text) ? data.raw_text.join(" ").normalize("NFKC") : "";
  const amount = data.transaction?.amount;
  const hasLabeledReference = /(?:รหัส\s*อ้างอิง|เลขที่\s*อ้างอิง|reference\s*(?:no\.?|id)?|transaction\s*id)\s*[:#：=-]?\s*[\p{L}\p{N}][\p{L}\p{N}_/-]{3,}/iu.test(rawText);
  const hasLabeledAmount = /(?:จำนวน|จ[ํำ]านวน)\s*เงิน|transfer\s*amount|amount\s*:/iu.test(rawText);
  const hasParty = Boolean(data.receiver?.name || data.receiver?.account_no);
  return hasLabeledReference && hasLabeledAmount && hasParty
    && typeof amount === "number" && Number.isFinite(amount) && amount > 0;
}

function canAttachNearReferenceQr(qr, slip) {
  if (!isQrOnlyReference(qr) || isQrOnlyReference(slip) || !hasStructuredSlipEvidence(slip)) return false;
  const qrReference = referenceOf(qr);
  const slipReference = referenceOf(slip);
  if (qrReference.length < 12 || !referenceEditDistanceAtMostOne(qrReference, slipReference)) return false;
  const qrBank = qr.data?.bank?.name;
  const slipBank = slip.data?.bank?.name;
  return !qrBank || !slipBank || qrBank === slipBank;
}

function mergeMissingFields(primary, secondary) {
  const merged = { ...primary, data: { ...primary.data } };
  for (const section of ["transaction", "sender", "receiver", "bank", "confidence"]) {
    const target = primary.data?.[section] || {};
    const source = secondary.data?.[section] || {};
    merged.data[section] = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (merged.data[section][key] == null && value != null) merged.data[section][key] = value;
    }
  }
  merged.data.raw_text = [...new Set([...(primary.data?.raw_text || []), ...(secondary.data?.raw_text || [])])];
  merged.data.warnings = [...new Set([
    ...(primary.data?.warnings || []),
    ...(secondary.data?.warnings || []),
    "พบ candidate Ref ID เดียวกันจากภาพต้นฉบับเดียวกัน; รวมการตรวจจับซ้ำของ QR-only เข้ากับรายการที่มีข้อมูลธุรกรรมและคงสถานะรอตรวจ",
  ])];
  merged.ocrTextBoxes = [...(primary.ocrTextBoxes || []), ...(secondary.ocrTextBoxes || [])];
  return merged;
}

function attachQrSupport(primary, qrRecord, referencesMatch = true) {
  return {
    ...primary,
    data: {
      ...primary.data,
      raw_text: [...new Set([...(primary.data?.raw_text || []), ...(qrRecord.data?.raw_text || [])])],
      warnings: [...new Set([
        ...(primary.data?.warnings || []),
        referencesMatch
          ? "พบ QR payload ที่มี Ref ID ตรงกับรายการสลิปในหน้าเดียวกัน; แนบเป็นหลักฐานประกอบโดยไม่คัดลอกข้อมูลอื่นจาก QR candidate"
          : `CRITICAL: Ref ID จาก QR (${referenceOf(qrRecord)}) กับ OCR (${referenceOf(primary)}) ต่างกันไม่เกิน 1 อักขระ; รวม candidate จากหลักฐานสลิปที่มีโครงสร้างและต้องตรวจภาพก่อนยืนยัน`,
      ])],
    },
    ocrTextBoxes: [...(primary.ocrTextBoxes || []), ...(qrRecord.ocrTextBoxes || [])],
  };
}

function completeness(record) {
  const data = record.data || {};
  return [
    data.transaction?.date, data.transaction?.time, data.transaction?.amount,
    data.sender?.name, data.sender?.account_no, data.receiver?.name, data.receiver?.account_no,
    data.bank?.name,
  ].filter((value) => value != null && value !== "").length;
}

/** Collapse overlapping repeats and QR-only evidence for a matching transaction on the same source page. */
export function dedupeEmbeddedSlipDetections(records) {
  const output = [];
  for (const record of records) {
    const reference = referenceOf(record);
    const duplicateIndex = reference ? output.findIndex((current) => {
      if (current.sourceItemId !== record.sourceItemId) return false;
      const referencesMatch = referenceOf(current) === reference;
      const qrAndSlip = isQrOnlyReference(current) !== isQrOnlyReference(record);
      const qrRecord = isQrOnlyReference(current) ? current : record;
      const slipRecord = qrRecord === current ? record : current;
      const qrSupportPair = sameSourcePage(current, record) && qrAndSlip
        && (referencesMatch || canAttachNearReferenceQr(qrRecord, slipRecord));
      return qrSupportPair || (referencesMatch && overlapsSameRegion(current, record) && !conflicts(current, record));
    }) : -1;
    if (duplicateIndex < 0) {
      output.push(record);
      continue;
    }
    const current = output[duplicateIndex];
    if (sameSourcePage(current, record) && isQrOnlyReference(current) !== isQrOnlyReference(record)) {
      const qrRecord = isQrOnlyReference(current) ? current : record;
      const primary = qrRecord === current ? record : current;
      output[duplicateIndex] = attachQrSupport(primary, qrRecord, referenceOf(primary) === referenceOf(qrRecord));
      continue;
    }
    const primary = completeness(record) > completeness(current) ? record : current;
    const secondary = primary === record ? current : record;
    output[duplicateIndex] = mergeMissingFields(primary, secondary);
  }
  return output;
}
