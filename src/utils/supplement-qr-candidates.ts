import type { LocalSlipCandidate } from "@/utils/local-qr-extractor";

function containsQrCenter(region: LocalSlipCandidate, qr: LocalSlipCandidate): boolean {
  const centerX = qr.bounds.x + qr.bounds.width / 2;
  const centerY = qr.bounds.y + qr.bounds.height / 2;
  return centerX >= region.bounds.x
    && centerX <= region.bounds.x + region.bounds.width
    && centerY >= region.bounds.y
    && centerY <= region.bounds.y + region.bounds.height;
}

function normalizeReference(value: string | null | undefined): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLocaleUpperCase()
    : "";
}

function referenceEditDistanceAtMostOne(left: string, right: string): boolean {
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

function getLabeledOcrReference(candidate: LocalSlipCandidate, allowParsedReference = false): string {
  if (allowParsedReference) return normalizeReference(candidate.data.transaction.reference_no);
  const rawText = Array.isArray(candidate.data.raw_text) ? candidate.data.raw_text.join(" ") : "";
  const match = rawText.match(/(?:รหัส\s*อ้างอิง|เลขที่\s*อ้างอิง|reference\s*(?:no\.?|id)?|transaction\s*id)\s*[:#：=-]?\s*([\p{L}\p{N}][\p{L}\p{N}_/-]{3,})/iu);
  const labeledReference = normalizeReference(match?.[1]);
  const parsedReference = normalizeReference(candidate.data.transaction.reference_no);
  return labeledReference && (!parsedReference || labeledReference === parsedReference) ? labeledReference : "";
}

function canonicalBankName(value: string | null | undefined): string | null {
  if (!value || value.includes("ตรวจพบ QR e-Slip")) return null;
  const normalized = value.normalize("NFKC").toLocaleLowerCase().replace(/[\s()_-]/g, "");
  const codeTokens: string[] = value.toLocaleUpperCase().match(/[A-Z]+/g) ?? [];
  const banks: Array<[RegExp, string]> = [
    [/กรุงไทย|krungthai/, "KTB"],
    [/กสิกรไทย|kasikorn/, "KBANK"],
    [/กรุงเทพ|bangkokbank/, "BBL"],
    [/ไทยพาณิชย์|siamcommercial/, "SCB"],
    [/กรุงศรี|krungsri|อยุธยา/, "BAY"],
    [/ทหารไทยธนชาต|ทีเอ็มบีธนชาต/, "TTB"],
    [/ออมสิน|governmentsavings/, "GSB"],
  ];
  return banks.find(([pattern, code]) => pattern.test(normalized) || codeTokens.includes(code))?.[1] ?? null;
}

function getQrOcrConflictWarnings(qr: LocalSlipCandidate, ocr: LocalSlipCandidate): string[] {
  const warnings: string[] = [];
  const qrAmount = qr.data.transaction.amount;
  const ocrAmount = ocr.data.transaction.amount;
  if (qrAmount != null && ocrAmount != null && Math.round(qrAmount * 100) !== Math.round(ocrAmount * 100)) {
    warnings.push(`CRITICAL: ยอดเงิน QR (${qrAmount.toFixed(2)}) ขัดกับ OCR (${ocrAmount.toFixed(2)}); ต้องตรวจทานก่อนยืนยัน`);
  }

  const qrBank = canonicalBankName(qr.data.bank.name);
  const ocrBank = canonicalBankName(ocr.data.bank.name);
  if (qrBank && ocrBank && qrBank !== ocrBank) {
    warnings.push(`CRITICAL: ธนาคาร QR (${qr.data.bank.name}) ขัดกับ OCR (${ocr.data.bank.name}); ต้องตรวจทานก่อนยืนยัน`);
  }
  const qrReference = normalizeReference(qr.data.transaction.reference_no);
  const ocrReference = getLabeledOcrReference(ocr);
  if (qrReference && ocrReference && qrReference !== ocrReference) {
    warnings.push(`CRITICAL: Ref ID จาก QR (${qr.data.transaction.reference_no}) ขัดกับ Ref ID ที่ OCR อ่าน (${ocrReference}); คงค่า QR และต้องตรวจภาพก่อนยืนยัน`);
  }
  return warnings;
}

function hasStructuredSlipOcrEvidence(qr: LocalSlipCandidate, ocr: LocalSlipCandidate): boolean {
  const ocrReference = getLabeledOcrReference(ocr);
  const rawText = Array.isArray(ocr.data.raw_text) ? ocr.data.raw_text.join(" ").normalize("NFKC") : "";
  const hasLabeledAmount = /(?:จำนวน|จ[ํำ]านวน)\s*เงิน|transfer\s*amount|amount\s*:/iu.test(rawText);
  const hasLabeledReference = Boolean(ocrReference);
  const hasPartyEvidence = Boolean(ocr.data.receiver.name || ocr.data.receiver.account_no);
  const qrAmount = qr.data.transaction.amount;
  const ocrAmount = ocr.data.transaction.amount;
  const amountsMatch = typeof qrAmount === "number" && Number.isFinite(qrAmount) && qrAmount > 0
    && typeof ocrAmount === "number" && Number.isFinite(ocrAmount)
    && Math.round(qrAmount * 100) === Math.round(ocrAmount * 100);
  const qrBank = canonicalBankName(qr.data.bank.name);
  const ocrBank = canonicalBankName(ocr.data.bank.name);

  return hasLabeledAmount && hasLabeledReference && hasPartyEvidence
    && (!qrBank || !ocrBank || qrBank === ocrBank)
    && typeof ocrAmount === "number" && Number.isFinite(ocrAmount) && ocrAmount > 0
    && (qrAmount == null || amountsMatch);
}

function hasPositionMatchedSlipFields(candidate: LocalSlipCandidate): boolean {
  const { transaction, sender, receiver } = candidate.data;
  const hasIdentifiedBank = Boolean(candidate.data.bank.name && !candidate.data.bank.name.includes("ตรวจพบ QR e-Slip"));
  return Boolean(transaction.amount != null || transaction.fee != null || transaction.reference_no
    || transaction.date || transaction.time || sender.name || sender.account_no
    || receiver.name || receiver.account_no || hasIdentifiedBank);
}

function hasNearReferenceSlipEvidence(qr: LocalSlipCandidate, ocr: LocalSlipCandidate): boolean {
  const qrReference = getLabeledOcrReference(qr, true);
  const ocrReference = getLabeledOcrReference(ocr);
  return qrReference.length >= 12 && ocrReference.length >= 12
    && referenceEditDistanceAtMostOne(qrReference, ocrReference)
    && hasStructuredSlipOcrEvidence(qr, ocr);
}

function traceContainsReceiver(trace: LocalSlipCandidate["ocrDiagnosticTrace"]): boolean {
  return Boolean(trace?.regions?.some((region) => typeof region.receiverName === "string" && region.receiverName.trim()));
}

function mergeMissingQrFields(qr: LocalSlipCandidate, ocr: LocalSlipCandidate, matchedBy: "position" | "reference" | "near-reference" | "unique-slip-facts"): LocalSlipCandidate {
  const qrData = qr.data;
  const ocrData = ocr.data;
  const referenceNo = qrData.transaction.reference_no ?? ocrData.transaction.reference_no;
  const date = qrData.transaction.date ?? ocrData.transaction.date;
  const time = qrData.transaction.time ?? ocrData.transaction.time;
  const bankName = qrData.bank.name && !qrData.bank.name.includes("ตรวจพบ QR e-Slip")
    ? qrData.bank.name
    : ocrData.bank.name || qrData.bank.name;
  const receiverName = qrData.receiver.name || ocrData.receiver.name;
  const senderName = qrData.sender.name || ocrData.sender.name;

  return {
    ...qr,
    ocrTextBoxes: [...(qr.ocrTextBoxes || []), ...(ocr.ocrTextBoxes || [])],
    ocrDiagnosticTrace: traceContainsReceiver(ocr.ocrDiagnosticTrace) && !traceContainsReceiver(qr.ocrDiagnosticTrace)
      ? ocr.ocrDiagnosticTrace
      : qr.ocrDiagnosticTrace ?? ocr.ocrDiagnosticTrace,
    data: {
      ...qrData,
      bank: {
        ...qrData.bank,
        name: bankName,
        confidence: qrData.bank.name && bankName === qrData.bank.name ? qrData.bank.confidence : ocrData.bank.confidence,
      },
      receiver: {
        ...qrData.receiver,
        name: receiverName,
        account_no: qrData.receiver.account_no ?? ocrData.receiver.account_no,
        bank: qrData.receiver.bank ?? ocrData.receiver.bank,
      },
      sender: {
        ...qrData.sender,
        name: senderName,
        account_no: qrData.sender.account_no ?? ocrData.sender.account_no,
        bank: qrData.sender.bank ?? ocrData.sender.bank,
      },
      transaction: {
        ...qrData.transaction,
        amount: qrData.transaction.amount ?? ocrData.transaction.amount,
        fee: qrData.transaction.fee ?? ocrData.transaction.fee,
        date,
        time,
        reference_no: referenceNo,
        transaction_id: qrData.transaction.transaction_id ?? ocrData.transaction.transaction_id ?? referenceNo,
      },
      confidence: {
        ...qrData.confidence,
        amount: qrData.transaction.amount != null ? qrData.confidence.amount : ocrData.confidence.amount,
        date: qrData.transaction.date ? qrData.confidence.date : ocrData.confidence.date,
        time: qrData.transaction.time ? qrData.confidence.time : ocrData.confidence.time,
        reference_no: qrData.transaction.reference_no ? qrData.confidence.reference_no : ocrData.confidence.reference_no,
        receiver_name: qrData.receiver.name ? qrData.confidence.receiver_name : ocrData.confidence.receiver_name,
        sender_name: qrData.sender.name ? qrData.confidence.sender_name : ocrData.confidence.sender_name,
        sender_account: qrData.sender.account_no ? qrData.confidence.sender_account : ocrData.confidence.sender_account,
        receiver_account: qrData.receiver.account_no ? qrData.confidence.receiver_account : ocrData.confidence.receiver_account,
      },
      raw_text: [...new Set([...qrData.raw_text, ...ocrData.raw_text])],
      warnings: [
        ...qrData.warnings,
        ...ocrData.warnings,
        ...getQrOcrConflictWarnings(qr, ocr),
      matchedBy === "reference"
        ? "ระบบจับคู่ QR กับข้อความ OCR จาก Ref ID ที่มีป้ายกำกับตรงกัน; โปรดตรวจข้อมูลก่อนยืนยัน"
        : matchedBy === "near-reference"
          ? "จับคู่ QR/OCR จาก Ref ID ที่ต่างกันไม่เกิน 1 อักขระ โดยมี candidate อย่างละหนึ่งและ OCR มีป้ายยอด/ข้อมูลผู้รับ; คง Ref จาก QR และต้องตรวจความต่างก่อนยืนยัน"
          : matchedBy === "unique-slip-facts"
            ? "จับคู่ QR/OCR จากภาพเดียวกันโดยมี QR หนึ่งรายการและ OCR หนึ่งบริเวณที่มีป้าย Ref/ยอดและข้อมูลผู้รับ; QR ไม่มี Ref ที่ parser แยกได้ จึงต้องตรวจภาพก่อนยืนยัน"
            : "ระบบจับคู่ QR กับข้อความ OCR จากตำแหน่งภาพ; โปรดตรวจข้อมูลก่อนยืนยัน",
      ],
    },
  };
}

/** Merge only uniquely position-matched OCR fields; ambiguous OCR remains a separate candidate. */
export function combineQrAndOcrSlipCandidates(
  qrCandidates: LocalSlipCandidate[],
  ocrCandidates: LocalSlipCandidate[],
): LocalSlipCandidate[] {
  const matchesByQr = qrCandidates.map((qr) => {
    const positioned = ocrCandidates.flatMap((ocr, index) => containsQrCenter(ocr, qr) ? [index] : []);
    const positionedWithFields = positioned.filter((index) => hasPositionMatchedSlipFields(ocrCandidates[index]));
    if (positionedWithFields.length) return positionedWithFields;

    const reference = getLabeledOcrReference(qr, true);
    if (reference && qrCandidates.filter((candidate) => getLabeledOcrReference(candidate, true) === reference).length === 1) {
      const referenceMatches = ocrCandidates.flatMap((ocr, index) => getLabeledOcrReference(ocr) === reference ? [index] : []);
      if (referenceMatches.length === 1) return referenceMatches;
    }

    if (!reference && qrCandidates.length === 1) {
      const structuredOcrMatches = ocrCandidates.flatMap((ocr, index) => hasStructuredSlipOcrEvidence(qr, ocr) ? [index] : []);
      if (structuredOcrMatches.length === 1) return structuredOcrMatches;
    }

    const qrReference = getLabeledOcrReference(qr, true);
    const nearReferenceMatches = ocrCandidates.flatMap((ocr, index) => hasNearReferenceSlipEvidence(qr, ocr) ? [index] : []);
    if (nearReferenceMatches.length === 1) {
      const ocrReference = getLabeledOcrReference(ocrCandidates[nearReferenceMatches[0]]);
      const uniqueQrMatch = qrCandidates.filter((candidate) => referenceEditDistanceAtMostOne(
        getLabeledOcrReference(candidate, true),
        ocrReference,
      )).length === 1;
      const uniqueOcrMatch = ocrCandidates.filter((candidate) => referenceEditDistanceAtMostOne(
        qrReference,
        getLabeledOcrReference(candidate),
      )).length === 1;
      if (uniqueQrMatch && uniqueOcrMatch) return nearReferenceMatches;
    }
    return [];
  });
  const matchesByOcr = ocrCandidates.map((_, ocrIndex) =>
    matchesByQr.flatMap((matches, qrIndex) => matches.includes(ocrIndex) ? [qrIndex] : []),
  );
  const consumedOcr = new Set<number>();

  const combined = qrCandidates.map((qr, qrIndex) => {
    const matches = matchesByQr[qrIndex];
    if (matches.length !== 1) return qr;

    const ocrIndex = matches[0];
    if (matchesByOcr[ocrIndex].length !== 1) return qr;

    consumedOcr.add(ocrIndex);
    ocrCandidates.forEach((candidate, index) => {
      if (index !== ocrIndex && containsQrCenter(candidate, qr) && !hasPositionMatchedSlipFields(candidate)) {
        consumedOcr.add(index);
      }
    });
    const matchedByReference = !containsQrCenter(ocrCandidates[ocrIndex], qr)
      && getLabeledOcrReference(qr, true) === getLabeledOcrReference(ocrCandidates[ocrIndex]);
    const matchedByNearReference = !containsQrCenter(ocrCandidates[ocrIndex], qr)
      && !matchedByReference
      && referenceEditDistanceAtMostOne(getLabeledOcrReference(qr, true), getLabeledOcrReference(ocrCandidates[ocrIndex]));
    const matchedByUniqueSlipFacts = !containsQrCenter(ocrCandidates[ocrIndex], qr) && !matchedByReference && !matchedByNearReference;
    const matchedBy = matchedByReference ? "reference" : matchedByNearReference ? "near-reference" : matchedByUniqueSlipFacts ? "unique-slip-facts" : "position";
    return mergeMissingQrFields(qr, ocrCandidates[ocrIndex], matchedBy);
  });

  ocrCandidates.forEach((candidate, index) => {
    if (!consumedOcr.has(index)) combined.push(candidate);
  });
  return combined;
}
