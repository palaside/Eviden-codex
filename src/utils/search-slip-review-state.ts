export type SearchSlipScanStatus = {
  state: "idle" | "scanning" | "complete" | "error";
  message: string;
};

export function createSearchSlipScanCompleteStatus(candidateCount: number): SearchSlipScanStatus {
  return {
    state: "complete",
    message: candidateCount > 0
      ? `สแกนเสร็จ พบ ${candidateCount} candidate รอตรวจทาน`
      : "สแกนเสร็จ แต่ไม่พบหน้าที่เข้าเกณฑ์ visual slip candidate",
  };
}

export function createSearchSlipScanErrorStatus(message: string): SearchSlipScanStatus {
  return { state: "error", message: `สแกนหาหน้าสลิปไม่สำเร็จ: ${message || "ไม่ทราบสาเหตุ"}` };
}

export function createSearchSlipExportErrorStatus(message: string): SearchSlipScanStatus {
  return { state: "error", message: `ส่งออก PDF ไม่สำเร็จ จึงยังไม่ได้สแกน: ${message || "ไม่ทราบสาเหตุ"}` };
}
