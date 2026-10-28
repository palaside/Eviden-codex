const BANK_RULES = [
  { code: "004", name: "ธนาคารกสิกรไทย (KBANK)", domains: ["kasikornbank.com"] },
  { code: "014", name: "ธนาคารไทยพาณิชย์ (SCB)", domains: ["scb.co.th"] },
  { code: "002", name: "ธนาคารกรุงเทพ (BBL)", domains: ["bangkokbank.com"] },
  { code: "006", name: "ธนาคารกรุงไทย (KTB)", domains: ["ktb.co.th", "krungthai.com"] },
  { code: "069", name: "ธนาคารเกียรตินาคินภัทร (KKP)", domains: ["kkpfg.com", "kiatnakin.co.th"] },
  { code: "025", name: "ธนาคารกรุงศรีอยุธยา (BAY)", domains: ["krungsri.com"] },
  { code: "011", name: "ธนาคารทหารไทยธนชาต (TTB)", domains: ["ttbbank.com"] },
  { code: "030", name: "ธนาคารออมสิน (GSB)", domains: ["gsb.or.th"] },
];

const UNKNOWN_BANK = Object.freeze({ code: "000", name: "ธนาคารไม่ระบุ", confidence: 0 });

function unknown(status) {
  return { ...UNKNOWN_BANK, status };
}

export function identifyBankFromPayload(payload) {
  if (typeof payload !== "string" || !payload.trim()) return unknown("QR_UNREADABLE");

  let url;
  try {
    url = new URL(payload.trim());
  } catch {
    return unknown("INVALID_PAYLOAD");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return unknown("INVALID_PAYLOAD");

  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  for (const rule of BANK_RULES) {
    if (rule.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return { code: rule.code, name: rule.name, confidence: 0.99, status: "BANK_DOMAIN_MATCH" };
    }
  }

  return unknown("UNMAPPED_DOMAIN");
}
