/**
 * Selects the source used by the processing pipeline without replacing the
 * original evidence file. A failed enhancement must never block review.
 */
export function selectDerivedProcessingSource(originalFile, enhancement) {
  if (enhancement?.status === "success" && enhancement.derivedFile instanceof File) {
    return {
      file: enhancement.derivedFile,
      sourceKind: "derived",
      reviewOnly: true,
      artifact: enhancement.metadata || null,
      warning: null,
    };
  }

  return {
    file: originalFile,
    sourceKind: "original",
    reviewOnly: true,
    artifact: enhancement?.metadata || null,
    warning: enhancement?.message || "สร้างภาพอนุพันธ์ไม่สำเร็จ; ใช้ภาพต้นฉบับต่อและคงสถานะรอตรวจทาน",
  };
}
