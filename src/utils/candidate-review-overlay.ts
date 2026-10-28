export interface EvidenceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export type CanvasRect = EvidenceBounds;

export function mapEvidenceBoundsToCanvas(
  bounds: EvidenceBounds,
  source: ImageSize,
  target: CanvasRect,
): CanvasRect | null {
  if (![bounds.x, bounds.y, bounds.width, bounds.height, source.width, source.height,
    target.x, target.y, target.width, target.height].every(Number.isFinite)) return null;
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0) return null;
  if (bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0) return null;
  if (bounds.x + bounds.width > source.width || bounds.y + bounds.height > source.height) return null;

  const scaleX = target.width / source.width;
  const scaleY = target.height / source.height;
  return {
    x: target.x + bounds.x * scaleX,
    y: target.y + bounds.y * scaleY,
    width: bounds.width * scaleX,
    height: bounds.height * scaleY,
  };
}
