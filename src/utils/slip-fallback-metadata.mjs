const MIN_FIELD_CONFIDENCE = 0.85;

function isMissing(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function buildSlipFallbackMetadata(data) {
  const fields = [
    ["bank.name", data.bank?.name, data.bank?.confidence, true],
    ["transaction.date", data.transaction?.date, data.confidence?.date, true],
    ["transaction.time", data.transaction?.time, data.confidence?.time, true],
    ["transaction.amount", data.transaction?.amount, data.confidence?.amount, true],
    ["transaction.reference_no", data.transaction?.reference_no, data.confidence?.reference_no, true],
    ["sender.name", data.sender?.name, data.confidence?.sender_name, true],
    ["sender.bank", data.sender?.bank, data.bank?.confidence, true],
    ["receiver.name", data.receiver?.name, data.confidence?.receiver_name, true],
    ["receiver.bank", data.receiver?.bank, data.bank?.confidence, true],
    ["transaction.note", data.transaction?.note, null, false],
  ];
  const unclearFields = fields
    .filter(([, value, confidence, hasConfidence]) => isMissing(value)
      || (hasConfidence && (typeof confidence !== "number" || confidence < MIN_FIELD_CONFIDENCE)))
    .map(([field]) => field);

  return {
    needs_human_review: unclearFields.length > 0,
    unclear_fields: unclearFields,
  };
}
