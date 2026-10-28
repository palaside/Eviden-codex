import type { LocalSlipCandidate } from "./local-qr-extractor";

export function finalizeSlipCandidates(
  qrCandidates: LocalSlipCandidate[],
  ocrCandidates: LocalSlipCandidate[],
): LocalSlipCandidate[];
