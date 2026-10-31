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
