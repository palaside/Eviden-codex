const normalizeText = (value) => String(value ?? "").trim().toLocaleUpperCase();

function normalizedReference(value) {
  const reference = normalizeText(value);
  return reference && !/^(CHAT|SLIP)-/i.test(reference) ? reference : "";
}

export function hasConflictingTransactionAnchors(left, right) {
  const leftReference = normalizedReference(left.referenceNo);
  const rightReference = normalizedReference(right.referenceNo);
  if (leftReference && rightReference && leftReference !== rightReference) return true;

  const leftDate = normalizeText(left.date);
  const rightDate = normalizeText(right.date);
  const leftTime = normalizeText(left.time);
  const rightTime = normalizeText(right.time);
  return Boolean(leftDate && rightDate && leftTime && rightTime
    && (leftDate !== rightDate || leftTime !== rightTime));
}

export function filterVisualPairsByTransactionAnchors(pairs, records) {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  return pairs.filter((pair) => {
    const left = recordsById.get(pair.leftId);
    const right = recordsById.get(pair.rightId);
    return left && right && !hasConflictingTransactionAnchors(left, right);
  });
}

function payloadFingerprint(record) {
  const date = normalizeText(record.date);
  const time = normalizeText(record.time);
  const amount = Number(record.amount);
  const sender = normalizeText(record.senderAccount).replace(/[\s-]/g, "");
  const receiver = normalizeText(record.receiverAccount).replace(/[\s-]/g, "");
  if (!date || !time || !Number.isFinite(amount) || amount <= 0
    || (sender.match(/\d/g) || []).length < 4
    || (receiver.match(/\d/g) || []).length < 4) return "";
  return JSON.stringify([date, time, amount.toFixed(2), sender, receiver]);
}

function pageLocations(record) {
  const pages = [];
  if (record.chatPage && record.chatPage !== "-") pages.push(`CHAT:${record.chatPage}`);
  if (Number.isInteger(record.dossierPage)) pages.push(`A4:${record.dossierPage}`);
  return pages;
}

function isSameSourceRegionAcrossPages(left, right) {
  if (!left.sourceItemId || left.sourceItemId !== right.sourceItemId
    || !left.chatPage || left.chatPage === "-"
    || !right.chatPage || right.chatPage === "-"
    || left.chatPage === right.chatPage) return false;

  const a = left.bounds;
  const b = right.bounds;
  if (!a || !b || ![a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height].every(Number.isFinite)
    || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;

  const intersectionWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const intersectionHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersectionArea = intersectionWidth * intersectionHeight;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 && intersectionArea / smallerArea >= 0.9;
}

/** Build a review-only cross-reference matrix. No record is excluded or promoted. */
export function buildDuplicateAuditMatrix(records, perceptualPairs = []) {
  const pairByKey = new Map();
  for (const pair of perceptualPairs) {
    const key = [pair.leftId, pair.rightId].sort().join("\u0000");
    pairByKey.set(key, pair.distance);
  }

  const rows = [];
  records.forEach((occurrence, index) => {
    const masterCandidates = [];
    for (const master of records.slice(0, index)) {
      const reasons = [];
      const leftSha = normalizeText(master.sha256);
      const rightSha = normalizeText(occurrence.sha256);
      const sameSourceOccurrence = master.sourceItemId && master.sourceItemId === occurrence.sourceItemId;
      if (!sameSourceOccurrence && leftSha && rightSha && leftSha === rightSha) reasons.push("exact_file_sha256");
      if (isSameSourceRegionAcrossPages(master, occurrence)) reasons.push("same_source_region_across_pages");

      const leftReference = normalizedReference(master.referenceNo);
      const rightReference = normalizedReference(occurrence.referenceNo);
      if (leftReference && leftReference === rightReference) reasons.push("reference_id");

      const leftPayload = payloadFingerprint(master);
      const rightPayload = payloadFingerprint(occurrence);
      if (leftPayload && leftPayload === rightPayload) reasons.push("transaction_payload_5d");

      const imageKey = [master.id, occurrence.id].sort().join("\u0000");
      const perceptualDistance = pairByKey.get(imageKey);
      if (perceptualDistance !== undefined && !hasConflictingTransactionAnchors(master, occurrence)) {
        reasons.push("perceptual_image");
      }

      if (reasons.length) masterCandidates.push({
        occurrenceId: master.id,
        source: master.source,
        chatPage: master.chatPage,
        dossierPage: master.dossierPage,
        locations: pageLocations(master),
        reasons,
        ...(perceptualDistance === undefined ? {} : { perceptualDistance }),
      });
    }
    if (!masterCandidates.length) return;
    rows.push({
      occurrenceId: occurrence.id,
      source: occurrence.source,
      locations: pageLocations(occurrence),
      status: masterCandidates.length > 1 ? "ambiguous" : "review",
      masterOccurrenceId: masterCandidates.length === 1 ? masterCandidates[0].occurrenceId : null,
      masterCandidates,
      reviewOnly: true,
    });
  });

  const affectedPages = [...new Set(rows.flatMap((row) => [
    ...row.locations,
    ...row.masterCandidates.flatMap((candidate) => candidate.locations),
  ]))].sort((a, b) => {
    const [aType, aPage] = a.split(":");
    const [bType, bPage] = b.split(":");
    const typeOrder = { CHAT: 0, A4: 1 };
    return typeOrder[aType] - typeOrder[bType] || aPage.localeCompare(bPage, undefined, { numeric: true });
  });
  return {
    summary: {
      totalOccurrenceCount: records.length,
      duplicateOccurrenceCount: rows.length,
      withoutDuplicateSignalCount: records.length - rows.length,
      affectedPages,
      affectedPageCount: affectedPages.length,
    },
    rows,
  };
}
