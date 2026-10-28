export function shouldBuildChatEvidenceLayers(jobKind: "CHAT" | "SLIP"): boolean;
export function filterTextOnlySlipRegionsForJob<T extends { bounds: { x0: number; y0: number; x1: number; y1: number } }>(
  regions: T[],
  options: {
    jobKind: "CHAT" | "SLIP";
    visualCandidates?: Array<{ objectTypeCandidate?: string; bounds: { x: number; y: number; width: number; height: number } }>;
    qrCandidates?: Array<{ bounds: { x: number; y: number; width: number; height: number } }>;
  },
): T[];
