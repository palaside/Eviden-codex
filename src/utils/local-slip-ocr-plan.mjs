export function buildLocalOcrPassPlan(jobKind, qrCandidateCount) {
  return {
    qrAnchored: Number(qrCandidateCount) > 0,
    fullPage: true,
  };
}
