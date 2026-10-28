export interface ImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function mapSliceBoundsToSource(
  bounds: ImageBounds,
  options: {
    sourceWidth: number;
    sliceStartY: number;
    contentScaleY: number;
    contentScaleX?: number;
    contentOffsetX?: number;
    renderWidth?: number;
  },
): ImageBounds {
  const scaleX = options.sourceWidth / (options.renderWidth ?? 807);
  const scaleY = scaleX * options.contentScaleY;
  const contentScaleX = options.contentScaleX ?? 1;
  const contentOffsetX = options.contentOffsetX ?? 0;

  return {
    x: (bounds.x - contentOffsetX) * scaleX * contentScaleX,
    y: (options.sliceStartY + bounds.y * options.contentScaleY) * scaleX,
    width: bounds.width * scaleX * contentScaleX,
    height: bounds.height * scaleY,
  };
}
