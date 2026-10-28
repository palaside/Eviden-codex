export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getRecipientRetryCropBounds(region: {
  bounds: { x0: number; y0: number; x1: number; y1: number };
  recipientFocusBounds: { x0: number; y0: number; x1: number; y1: number } | null;
}) {
  const bounds = region.recipientFocusBounds ?? region.bounds;
  return {
    x: bounds.x0,
    y: bounds.y0,
    width: bounds.x1 - bounds.x0,
    height: bounds.y1 - bounds.y0,
  };
}

export function getQrAnchoredOcrCrop(
  image: { width: number; height: number },
  qr: PixelBounds,
): PixelBounds {
  const width = Math.min(image.width, Math.max(image.width * 0.68, qr.width * 9));
  const height = Math.min(image.height, Math.max(image.height * 0.76, qr.height * 13));
  const qrCenterX = qr.x + qr.width / 2;
  const qrCenterY = qr.y + qr.height / 2;
  const x = qrCenterX >= image.width / 2
    ? qrCenterX - width * 0.82
    : qrCenterX - width * 0.18;
  const y = qrCenterY - height * 0.44;
  const left = Math.max(0, Math.min(image.width - width, x));
  const top = Math.max(0, Math.min(image.height - height, y));

  return {
    x: Math.floor(left),
    y: Math.floor(top),
    width: Math.ceil(Math.min(width, image.width - left)),
    height: Math.ceil(Math.min(height, image.height - top)),
  };
}
