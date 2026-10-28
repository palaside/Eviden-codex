export function buildOcrAttemptTrace(input) {
  const scale = Number.isFinite(input.scale) && input.scale > 0 ? input.scale : 1;
  return Object.freeze({
    id: input.id,
    scope: input.scope,
    trigger: input.trigger,
    sourceBounds: { ...input.sourceBounds },
    inputDimensions: { width: input.inputWidth, height: input.inputHeight },
    scale,
    meanConfidence: input.meanConfidence,
    lines: input.lines.map((line, index) => Object.freeze({
      id: `${input.id}-line-${index}`,
      text: line.text,
      confidence: line.confidence,
      bounds: {
        x: input.sourceBounds.x + line.bbox.x0 / scale,
        y: input.sourceBounds.y + line.bbox.y0 / scale,
        width: (line.bbox.x1 - line.bbox.x0) / scale,
        height: (line.bbox.y1 - line.bbox.y0) / scale,
      },
    })),
  });
}

export function explainSlipOcrRegionRejection({ lines, qrCount, regionCount }) {
  if (regionCount > 0) return [];
  const text = lines.map((line) => line.text).join(" ").normalize("NFKC");
  const hasSuccess = /โอนเงิน.{0,4}(?:เร็จ|เรือ)|โอน.{0,4}สำเร็จ|transfersuccess|successfultransfer/iu.test(text);
  const hasReferenceCue = /(?:รหัส|เลขที่)อ้างอ.{0,2}ง|reference|transactionid/iu.test(text);
  const hasAmountLabel = /[จขอ][ํำ]านวน(?:เง[ิี]?น|เว[ิี]น)|ยอดเงิน|amount/iu.test(text);
  const hasStandaloneAmount = lines.some((line) => /(?:฿\s*)?\d[\d,]*\.\d{2}(?:\s*(?:บาท|THB))?/iu.test(line.text.trim()));
  if (qrCount === 0 && hasSuccess && hasStandaloneAmount && !hasAmountLabel && !hasReferenceCue) {
    return ["ไม่สร้าง OCR region: ตรวจไม่พบ QR และยอดเป็นบรรทัด standalone; parser ต้องพบ reference cue ก่อนจึงเลือกยอด standalone และผ่าน supported-evidence gate ได้ แต่ OCR attempt นี้ไม่มีบรรทัดป้าย Ref ID ดังกล่าว"];
  }
  return ["ไม่สร้าง OCR region: ข้อมูล OCR ที่มีไม่ผ่านเงื่อนไขหลักฐานของ parser; ดูข้อความดิบและกรอบใน attempts ก่อนสรุปสาเหตุเพิ่มเติม"];
}
