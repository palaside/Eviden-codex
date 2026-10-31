const FIELD_NAMES = [
  "sender_name",
  "sender_account",
  "receiver_name",
  "receiver_account",
  "amount",
  "fee",
  "date",
  "time",
  "reference_no",
  "transaction_id",
  "bank",
];

const FIELD_BUNDLE_PROMPT = `คุณกำลังอ่าน field crop หลายภาพของสลิปใบเดียวกัน
คืน JSON เท่านั้นในรูปแบบ:
{
  "fields": {
    "sender_name": {"value": null, "raw_text": null, "confidence": 0, "source_field": "sender_name"},
    "sender_account": {"value": null, "raw_text": null, "confidence": 0, "source_field": "sender_account"},
    "receiver_name": {"value": null, "raw_text": null, "confidence": 0, "source_field": "receiver_name"},
    "receiver_account": {"value": null, "raw_text": null, "confidence": 0, "source_field": "receiver_account"},
    "amount": {"value": null, "raw_text": null, "confidence": 0, "source_field": "amount"},
    "fee": {"value": null, "raw_text": null, "confidence": 0, "source_field": "fee"},
    "date": {"value": null, "raw_text": null, "confidence": 0, "source_field": "date"},
    "time": {"value": null, "raw_text": null, "confidence": 0, "source_field": "time"},
    "reference_no": {"value": null, "raw_text": null, "confidence": 0, "source_field": "reference_no"},
    "transaction_id": {"value": null, "raw_text": null, "confidence": 0, "source_field": "transaction_id"},
    "bank": {"value": null, "raw_text": null, "confidence": 0, "source_field": "bank"}
  },
  "warnings": [],
  "review_status": "review_required"
}

กติกา:
- แต่ละภาพมี label FIELD ที่อยู่ในข้อความก่อนภาพ ห้ามนำข้อความจาก field อื่นมาปนกัน
- อ่านเฉพาะสิ่งที่เห็นจริง รวมเครื่องหมาย *** ตามภาพ ห้ามเดาชื่อหรือแก้คำเอง
- ถ้าอ่านไม่ได้ให้ value และ raw_text เป็น null และ confidence เป็น 0
- ห้ามยืนยันธุรกรรม ห้ามสรุปว่าถูกหรือผิด
- ต้องคืน fields ให้ครบตามรายการ แม้บาง field ไม่มีภาพหรืออ่านไม่ได้
- review_status ต้องเป็น review_required เสมอ`;

function decodeDataUrl(value) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value || "");
  if (!match) throw new Error("field crop ต้องเป็น data URL แบบ base64");
  return { mimeType: match[1], data: match[2] };
}

export function buildGeminiFieldBundlePayload({ slipId, fields }) {
  if (!slipId) throw new Error("slipId is required");
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("อย่างน้อยต้องมี field crop หนึ่งรายการ");
  }

  const parts = [{
    text: `${FIELD_BUNDLE_PROMPT}\nSLIP_ID: ${slipId}\nFIELD_ORDER: ${FIELD_NAMES.join(", ")}\nภาพต่อไปนี้เป็น field crop ของสลิปใบเดียวกัน:`,
  }];

  for (const field of fields) {
    if (!field?.field || !FIELD_NAMES.includes(field.field)) continue;
    const decoded = decodeDataUrl(field.cropDataUrl);
    parts.push({ text: `FIELD: ${field.field}` });
    parts.push({ inline_data: { mime_type: decoded.mimeType, data: decoded.data } });
  }

  if (parts.length === 1) throw new Error("ไม่พบ field crop ที่รู้จัก");
  return {
    contents: [{ parts }],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0,
    },
  };
}

export function mergeGeminiFieldBundle(base, bundle) {
  const next = structuredClone(base);
  const fields = bundle?.fields || {};
  const setText = (target, value) => typeof value === "string" && value.trim() ? value.trim() : target;
  const setConfidence = (target, value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : target;
  const map = {
    sender_name: ["sender", "name"], sender_account: ["sender", "account_no"],
    receiver_name: ["receiver", "name"], receiver_account: ["receiver", "account_no"],
    amount: ["transaction", "amount"], fee: ["transaction", "fee"],
    date: ["transaction", "date"], time: ["transaction", "time"],
    reference_no: ["transaction", "reference_no"], transaction_id: ["transaction", "transaction_id"],
    bank: ["bank", "name"],
  };
  for (const [field, [group, key]] of Object.entries(map)) {
    const evidence = fields[field];
    if (!evidence || evidence.value === null || evidence.value === undefined) continue;
    if (group === "bank") next.bank.name = setText(next.bank.name, String(evidence.value));
    else if (group === "transaction" && ["amount", "fee"].includes(key)) {
      const numeric = typeof evidence.value === "number" ? evidence.value : Number(String(evidence.value).replace(/,/g, ""));
      if (Number.isFinite(numeric) && numeric > 0) next.transaction[key] = numeric;
    } else next[group][key] = setText(next[group][key], String(evidence.value));
    const confidenceKey = field === "bank" ? null : field;
    if (confidenceKey && confidenceKey in next.confidence) next.confidence[confidenceKey] = setConfidence(next.confidence[confidenceKey], evidence.confidence);
  }
  next.warnings = [...new Set([...(next.warnings || []), ...(bundle.warnings || []), "GEMINI_FIELD_BUNDLE_REVIEW_ONLY"] )];
  next._fallback_meta = { needs_human_review: true, unclear_fields: Object.entries(fields).filter(([, value]) => !value?.value).map(([key]) => key) };
  return next;
}
