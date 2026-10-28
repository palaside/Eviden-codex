export function buildSlipExtractionStatus({ qrFailed, ocrFailed }) {
  if (qrFailed && ocrFailed) {
    return {
      error: "การสแกน QR และ OCR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ",
      warnings: ["การสแกน QR ในเครื่องขัดข้อง", "OCR ในเครื่องขัดข้อง", "โปรดตรวจภาพต้นฉบับ"],
    };
  }

  if (qrFailed) {
    const message = "การสแกน QR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ";
    return { error: message, warnings: [message] };
  }

  if (ocrFailed) {
    const message = "OCR ในเครื่องขัดข้อง — โปรดตรวจภาพต้นฉบับ";
    return { error: message, warnings: [message] };
  }

  const message = "สแกน QR/OCR ในเครื่องแล้วแต่ยังไม่มี candidate สลิป — โปรดตรวจภาพต้นฉบับ";
  return { error: message, warnings: [message] };
}

export function buildSlipQrWarning(qrFailed) {
  return qrFailed ? "QR scan ในเครื่องขัดข้อง; candidate ที่ได้จากแหล่งอื่นยังต้องตรวจทาน" : null;
}
