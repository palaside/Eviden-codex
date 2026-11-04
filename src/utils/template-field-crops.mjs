const FIELD_NAMES = [
  "amount",
  "senderName",
  "senderAccount",
  "receiverName",
  "receiverAccount",
  "transactionDate",
  "transactionTime",
  "referenceNo",
  "qr",
];

// Template keys are intentionally display-oriented camelCase, while the
// extraction contract uses the canonical snake_case names below. Keep this
// mapping at the boundary so template geometry cannot silently lose values.
const CANONICAL_FIELD_NAMES = Object.freeze({
  bank: "bank_name",
  amount: "amount",
  senderName: "sender_name",
  senderAccount: "sender_account",
  receiverName: "receiver_name",
  receiverAccount: "receiver_account",
  transactionDate: "date",
  transactionTime: "time",
  referenceNo: "reference_no",
  qr: "qr_payload",
});

export function toCanonicalFieldName(field) {
  return CANONICAL_FIELD_NAMES[field] || field;
}

export function toTemplateFieldName(field) {
  const entry = Object.entries(CANONICAL_FIELD_NAMES).find(([, canonical]) => canonical === field);
  return entry ? entry[0] : field;
}

const OCR_FIELD_ALIASES = Object.freeze({
  reference: ["referenceNo"],
  reference_no: ["referenceNo"],
  date_time: ["transactionDate", "transactionTime"],
  sender_bank: ["senderBank", "bank"],
  receiver_bank: ["receiverBank", "bank"],
  bank: ["bank"],
});

function expandOcrField(field) {
  return OCR_FIELD_ALIASES[field] || [toTemplateFieldName(field)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function buildTemplateFieldPlan(template, dimensions) {
  if (!template || !dimensions?.width || !dimensions?.height) return {};
  return Object.fromEntries(FIELD_NAMES.flatMap((field) => {
    const entry = template.fields?.[field];
    if (!entry?.region) return [];
    const x = clamp(Math.round(entry.region.x * dimensions.width), 0, dimensions.width - 1);
    const y = clamp(Math.round(entry.region.y * dimensions.height), 0, dimensions.height - 1);
    const right = clamp(Math.round((entry.region.x + entry.region.width) * dimensions.width), x + 1, dimensions.width);
    const bottom = clamp(Math.round((entry.region.y + entry.region.height) * dimensions.height), y + 1, dimensions.height);
    return [[field, {
      field,
      source: entry.source,
      status: "review",
      bounds: { x, y, width: right - x, height: bottom - y },
    }]];
  }));
}

export function cropTemplateFields(source, plan) {
  if (!source?.width || !source?.height || !plan) return [];
  return Object.values(plan).map((entry) => ({
    field: entry.field,
    bounds: { ...entry.bounds },
    source: entry.source,
    status: "review",
    // The UI layer attaches the actual data URL/Blob from these bounds.
    cropArtifact: null,
  }));
}

/**
 * Joins template geometry with OCR evidence without dropping fields that OCR
 * did not recognize. Missing OCR remains explicit and reviewable.
 */
export function mergeTemplateAndOcrFields(plan = {}, ocrTextBoxes = []) {
  const entries = new Map(Object.entries(plan));
  for (const box of ocrTextBoxes) {
    for (const field of box.supportsFields || []) {
      for (const templateField of expandOcrField(field)) {
        if (!entries.has(templateField)) entries.set(templateField, { field: templateField, source: "ocr_evidence", bounds: box.bounds });
      }
    }
  }
  return [...entries.values()].map((entry) => {
    const boxes = ocrTextBoxes
      .filter((box) => (box.supportsFields || []).some((field) => expandOcrField(field).includes(entry.field)))
      .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
    return {
      field: entry.field,
      source: entry.source,
      bounds: boxes[0]?.bounds || entry.bounds,
      ocrBox: boxes[0] || null,
      alternatives: boxes.slice(1),
    };
  }).filter((entry) => entry.bounds && entry.bounds.width > 0 && entry.bounds.height > 0);
}
