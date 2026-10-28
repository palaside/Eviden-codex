// Production-Ready: QR Payload -> Bank (pure, no color/OCR/crop logic)
export type BankCode = "BBL" | "KKP" | "KBANK" | "SCB" | "UNKNOWN";

export interface IdentifyResult {
  bank: BankCode;
  reason: string;
}

const MAP: Array<{ bank: BankCode; hosts: string[] }> = [
  { bank: "BBL", hosts: ["bangkokbank.com"] },
  { bank: "KKP", hosts: ["kkpfg.com", "kiatnakin.co.th"] },
  { bank: "KBANK", hosts: ["kasikornbank.com"] },
  { bank: "SCB", hosts: ["scb.co.th"] },
];

export function identifyBank(payload: string | null | undefined): IdentifyResult {
  if (!payload || !payload.trim()) return { bank: "UNKNOWN", reason: "QR_UNREADABLE" };
  const s = payload.trim();
  let host = "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { bank: "UNKNOWN", reason: "INVALID_PAYLOAD" };
    host = u.hostname.toLowerCase();
  } catch {
    return { bank: "UNKNOWN", reason: "INVALID_PAYLOAD" };
  }
  for (const e of MAP) {
    if (e.hosts.some((h) => host === h || host.endsWith("." + h))) return { bank: e.bank, reason: "DOMAIN_MATCH:" + host };
  }
  return { bank: "UNKNOWN", reason: "UNMAPPED_DOMAIN" };
}
