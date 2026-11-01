export function attachOcrTraceToQrCandidates(qrCandidates, ocrDiagnosticTrace) {
  return qrCandidates.map((candidate) => ({
    ...candidate,
    ocrTextBoxes: candidate.ocrTextBoxes || [],
    ocrDiagnosticTrace,
  }));
}
