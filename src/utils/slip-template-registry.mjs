const FIELD_ORDER = [
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

// Coordinates are normalized research regions, not asserted facts about a
// particular image. Every field remains review-only until the crop is checked.
const TEMPLATES = Object.freeze({
  "krungthai-slip-v1": {
    id: "krungthai-slip-v1",
    bankAliases: ["krungthai", "กรุงไทย"],
    reviewOnly: true,
    fields: makeFields({
      amount: [0.18, 0.52, 0.82, 0.64],
      senderName: [0.18, 0.30, 0.82, 0.40],
      senderAccount: [0.18, 0.39, 0.82, 0.45],
      receiverName: [0.18, 0.42, 0.82, 0.52],
      receiverAccount: [0.18, 0.51, 0.82, 0.57],
      transactionDate: [0.18, 0.66, 0.82, 0.72],
      transactionTime: [0.18, 0.66, 0.82, 0.72],
      referenceNo: [0.18, 0.20, 0.82, 0.28],
      qr: [0.72, 0.12, 0.94, 0.32],
    }),
  },
  "ttb-slip-v1": {
    id: "ttb-slip-v1",
    bankAliases: ["ttb", "ทีเอ็มบีธนชาต", "ทหารไทยธนชาต", "ธนาคารทหารไทยธนชาต"],
    reviewOnly: true,
    fields: makeFields({
      amount: [0.18, 0.45, 0.82, 0.56],
      senderName: [0.18, 0.55, 0.82, 0.64],
      senderAccount: [0.18, 0.64, 0.82, 0.70],
      receiverName: [0.18, 0.70, 0.82, 0.79],
      receiverAccount: [0.18, 0.79, 0.82, 0.85],
      transactionDate: [0.18, 0.87, 0.82, 0.94],
      transactionTime: [0.18, 0.87, 0.82, 0.94],
      referenceNo: [0.18, 0.38, 0.82, 0.45],
      qr: [0.72, 0.76, 0.94, 0.96],
    }),
  },
});

function makeFields(regions) {
  return Object.fromEntries(FIELD_ORDER.map((field) => [field, {
    source: "template_region_only",
    reviewOnly: true,
    region: {
      x: regions[field][0],
      y: regions[field][1],
      width: regions[field][2] - regions[field][0],
      height: regions[field][3] - regions[field][1],
    },
  }]));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function listSlipTemplates() {
  return Object.values(TEMPLATES).map(clone);
}

export function getSlipTemplate(id) {
  const template = TEMPLATES[id];
  return template ? clone(template) : null;
}

/** @param {{bankName?: string|null, rawText?: string[]}} options */
export function selectSlipTemplate({ bankName, rawText = [] } = {}) {
  const haystack = [bankName, ...rawText].map(normalize).join(" ");
  if (!haystack) return null;
  const template = Object.values(TEMPLATES).find((candidate) =>
    candidate.bankAliases.some((alias) => haystack.includes(normalize(alias))),
  );
  return template ? clone(template) : null;
}
