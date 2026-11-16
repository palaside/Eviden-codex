export function getSlipStatusRetryBounds(lines, qr, dimensions) {
  const normalize = text => String(text).normalize('NFC').replace(/\u0e4d\u0e32/gu,'ำ');
  if (lines.some(line=>/โอนเงินสำเร็จ/u.test(normalize(line.text)))) return null;
  const line = lines.find(line=>/เงิน.{0,5}(?:สำ|เรจ|เร็จ)/u.test(normalize(line.text)));
  if (!line?.bbox || !qr) return null;
  // This anchor locates a crop boundary; it does not confirm reference text.
  const reference = lines.find(other=>/รหัสอ้าง/u.test(normalize(other.text))
    && other.bbox.y0>line.bbox.y0 && other.bbox.y0-line.bbox.y0<2*(line.bbox.y1-line.bbox.y0));
  const x = Math.max(0,Math.floor(line.bbox.x0)-3,reference ? reference.bbox.x0-5 : 0);
  const y = Math.max(0,Math.floor(line.bbox.y0)-4);
  const overlapQr = qr.y < line.bbox.y1 && qr.y+qr.height > line.bbox.y0;
  const right = Math.min(dimensions.width, overlapQr && qr.x > x+40 ? qr.x-4 : line.bbox.x1+3);
  const bottom = Math.min(dimensions.height,Math.ceil(line.bbox.y1)+4,reference ? reference.bbox.y0-3 : dimensions.height);
  if (right-x < 40 || bottom-y < 10) return null;
  return {x,y,width:right-x,height:bottom-y};
}
