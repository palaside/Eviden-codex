// Pure math: fit slip into 645x890, center (322.5,445), aspect-lock, small-bypass
export const TARGET_W = 645;
export const TARGET_H = 890;

export interface Fit {
  newW: number; newH: number; x: number; y: number; scale: number;
}

export function fitSlip(wOrig: number, hOrig: number): Fit {
  if (!Number.isFinite(wOrig) || !Number.isFinite(hOrig) || wOrig <= 0 || hOrig <= 0)
    throw new Error("INVALID_DIMENSIONS");
  const scale = Math.min(1, Math.min(TARGET_W / wOrig, TARGET_H / hOrig));
  const newW = Math.round(wOrig * scale);
  const newH = Math.round(hOrig * scale);
  const x = Math.floor((TARGET_W - newW) / 2);
  const y = Math.floor((TARGET_H - newH) / 2);
  return { newW, newH, x, y, scale };
}
