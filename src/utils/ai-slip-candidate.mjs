export function projectAiSlipBounds(box, imageWidth, imageHeight) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((value) => Number.isFinite(value) && value >= 0 && value <= 1000)
    || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) return null;
  const [top, left, bottom, right] = box;
  if (bottom <= top || right <= left) return null;
  return {
    x: Math.round(left * imageWidth / 1000),
    y: Math.round(top * imageHeight / 1000),
    width: Math.round((right - left) * imageWidth / 1000),
    height: Math.round((bottom - top) * imageHeight / 1000),
  };
}

/** @param {any} proposedData */
export function findMatchingSlipRecord(records, bounds, proposedData = null) {
  const area = bounds.width * bounds.height;
  if (!Number.isFinite(area) || area <= 0) return null;
  return records.find((record) => {
    const prior = record.sourceBounds;
    if (!prior || prior.width <= 0 || prior.height <= 0) return false;
    const width = Math.max(0, Math.min(bounds.x + bounds.width, prior.x + prior.width) - Math.max(bounds.x, prior.x));
    const height = Math.max(0, Math.min(bounds.y + bounds.height, prior.y + prior.height) - Math.max(bounds.y, prior.y));
    const overlap = width * height / Math.min(area, prior.width * prior.height);
    const sameTransaction = Boolean(proposedData?.transaction?.reference_no)
      && proposedData.transaction.reference_no === record.data?.transaction?.reference_no
      && proposedData.transaction.amount === record.data?.transaction?.amount;
    return overlap >= 0.8 || (sameTransaction && overlap >= 0.1);
  }) || null;
}

export function mergeAiSlipProposal(local, ai) {
  const conflicts = [];
  const hasValue = (value) => value != null && (typeof value !== "string" || value.trim() !== "");
  const choose = (path, current, proposed) => {
    if (hasValue(current) && hasValue(proposed) && current !== proposed) conflicts.push(path);
    return hasValue(current) ? current : proposed;
  };
  const transaction = { ...local.transaction };
  for (const key of ["date", "time", "amount", "fee", "reference_no", "transaction_id", "note"]) {
    transaction[key] = choose(`transaction.${key}`, local.transaction[key], ai.transaction[key]);
  }
  const sender = { ...local.sender };
  const receiver = { ...local.receiver };
  for (const key of ["name", "bank", "account_no"]) {
    sender[key] = choose(`sender.${key}`, local.sender[key], ai.sender[key]);
    receiver[key] = choose(`receiver.${key}`, local.receiver[key], ai.receiver[key]);
  }
  const bankName = choose("bank.name", local.bank.name, ai.bank.name);
  const confidence = { ...local.confidence };
  for (const [confidenceKey, value] of Object.entries({
    date: "date", time: "time", amount: "amount", reference_no: "reference_no",
    sender_name: "sender.name", receiver_name: "receiver.name",
    sender_account: "sender.account_no", receiver_account: "receiver.account_no",
  })) {
    const [group, field] = value.includes(".") ? value.split(".") : ["transaction", value];
    if (!hasValue(local[group][field]) && hasValue(ai[group][field])) confidence[confidenceKey] = ai.confidence[confidenceKey];
  }
  return {
    ...local,
    bank: { ...local.bank, name: bankName, confidence: local.bank.name == null ? ai.bank.confidence : local.bank.confidence },
    transaction, sender, receiver, confidence,
    raw_text: [...new Set([...(local.raw_text || []), ...(ai.raw_text || [])])],
    warnings: [...new Set([
      ...(local.warnings || []),
      ...(ai.warnings || []),
      "AI เสนอข้อมูลจากภาพ; ทุกช่องยังรอตรวจทานกับต้นฉบับ",
      ...(conflicts.length ? [`ค่า AI ขัดกันกับค่าที่มีอยู่ (${conflicts.join(", ")}); คงค่าเดิมและรอตรวจ`] : []),
    ])],
  };
}

export function getAiFilledFields(local, ai) {
  const hasValue = (value) => value != null && (typeof value !== "string" || value.trim() !== "");
  const fields = ["bank.name", "transaction.date", "transaction.time", "transaction.amount", "transaction.fee", "transaction.reference_no", "sender.name", "sender.bank", "sender.account_no", "receiver.name", "receiver.bank", "receiver.account_no"];
  return fields.filter((path) => {
    const [group, key] = path.split(".");
    return !hasValue(local[group]?.[key]) && hasValue(ai[group]?.[key]);
  });
}

export function retainSenderNameAfterReprocess(priorRecords, freshRecord) {
  const fresh = freshRecord?.data;
  if (!fresh) return freshRecord;
  const reference = fresh.transaction?.reference_no;
  if (!reference) return freshRecord;
  const prior = priorRecords.find((record) =>
    record.sourceSha256 === freshRecord.sourceSha256
    && record.data?.transaction?.reference_no === reference
    && record.data?.transaction?.amount === fresh.transaction?.amount
    && (record.data?.reviewed_fields?.includes("sender_name")
      || record.aiProposedFields?.includes("sender.name") || record.aiProposedFields?.includes("all"))
    && record.data?.sender?.name,
  );
  if (!prior) return freshRecord;
  const sides = [
    { dataKey: "sender", confidenceKey: "sender_name", reviewedKey: "sender_name", path: "sender.name", label: "ผู้โอน" },
    { dataKey: "receiver", confidenceKey: "receiver_name", reviewedKey: "receiver_name", path: "receiver.name", label: "ผู้รับ" },
  ];
  let nextRecord = freshRecord;
  for (const side of sides) {
    const priorName = prior.data?.[side.dataKey]?.name;
    const freshName = nextRecord.data?.[side.dataKey]?.name;
    if (!priorName || freshName != null) continue;
    const userReviewed = prior.data.reviewed_fields?.includes(side.reviewedKey);
    const aiOnly = prior.aiProposedFields?.includes("all") || prior.aiProposedFields?.includes(side.path);
    if (!userReviewed && !aiOnly) continue;
    // Preserve masked/user-reviewed evidence, but never carry an unmasked AI
    // guess forward when the fresh crop cannot reproduce it.
    if (!userReviewed && !String(priorName).includes("*")) {
      nextRecord = {
        ...nextRecord,
        needsReview: true,
        data: {
          ...nextRecord.data,
          warnings: [...new Set([...(nextRecord.data.warnings || []), `ตัดชื่อ${side.label}จากผล AI เดิมที่ตรวจซ้ำแล้วไม่พบ; รอตรวจจากภาพ`])],
        },
      };
      continue;
    }
    nextRecord = {
      ...nextRecord,
      needsReview: true,
      ...(userReviewed ? {} : { aiProposedFields: [...new Set([...(nextRecord.aiProposedFields || []), side.path])] }),
      data: {
        ...nextRecord.data,
        [side.dataKey]: { ...nextRecord.data[side.dataKey], name: priorName },
        confidence: { ...nextRecord.data.confidence, [side.confidenceKey]: userReviewed ? 0 : prior.data.confidence[side.confidenceKey] },
        ...(userReviewed ? { reviewed_fields: [...new Set([...(nextRecord.data.reviewed_fields || []), side.reviewedKey])] }
          : { raw_text: [...new Set([...(nextRecord.data.raw_text || []), ...(prior.data.raw_text || [])])] }),
        warnings: [...new Set([...(nextRecord.data.warnings || []), userReviewed
          ? `ชื่อ${side.label}ที่ผู้ใช้แก้ไว้สำหรับภาพและ Ref เดิม; รอตรวจทาน ไม่ใช่ผล OCR`
          : `ชื่อ${side.label}แบบปกปิดจากผลเดิม; รอตรวจทานกับสลิป`])],
      },
    };
  }
  return nextRecord;
}

export function clearUnreproducedAiNames(priorRecord, freshData) {
  if (!priorRecord?.data || !freshData) return freshData;
  const next = { ...freshData, sender: { ...freshData.sender }, receiver: { ...freshData.receiver }, confidence: { ...freshData.confidence } };
  for (const side of [
    { dataKey: "sender", confidenceKey: "sender_name", reviewedKey: "sender_name", path: "sender.name", label: "ผู้โอน" },
    { dataKey: "receiver", confidenceKey: "receiver_name", reviewedKey: "receiver_name", path: "receiver.name", label: "ผู้รับ" },
  ]) {
    const priorName = priorRecord.data[side.dataKey]?.name;
    const freshName = next[side.dataKey]?.name;
    const wasAiOnly = priorRecord.aiProposedFields?.includes("all") || priorRecord.aiProposedFields?.includes(side.path);
    const wasReviewed = priorRecord.data.reviewed_fields?.includes(side.reviewedKey);
    if (priorName && freshName == null && wasAiOnly && !wasReviewed && !String(priorName).includes("*")) {
      next[side.dataKey] = { ...next[side.dataKey], name: null };
      next.confidence[side.confidenceKey] = 0;
      next.warnings = [...new Set([...(next.warnings || []), `ตัดชื่อ${side.label}จากผล AI เดิมที่ตรวจซ้ำแล้วไม่พบ; รอตรวจจากภาพ`])];
    }
  }
  return next;
}

export function retainAiOnlyRecordsAfterReprocess(priorRecords, freshRecords, sourceSha256) {
  const references = new Set(freshRecords.map((record) => record.data?.transaction?.reference_no).filter(Boolean));
  const retained = priorRecords.filter((record) => {
    const reference = record.data?.transaction?.reference_no;
    if (record.sourceSha256 !== sourceSha256 || record.isConfirmed
      || !record.aiProposedFields?.includes("all") || !reference || references.has(reference)) return false;
    references.add(reference);
    return true;
  }).map((record) => ({ ...record, isConfirmed: false, needsReview: true }));
  return [...freshRecords, ...retained];
}
