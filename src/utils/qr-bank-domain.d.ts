export type QrBankIdentificationStatus = "BANK_DOMAIN_MATCH" | "INVALID_PAYLOAD" | "UNMAPPED_DOMAIN" | "QR_UNREADABLE";

export interface QrBankIdentification {
  code: string;
  name: string;
  confidence: number;
  status: QrBankIdentificationStatus;
}

export function identifyBankFromPayload(payload: string): QrBankIdentification;
