export function fitImageToEvidenceBlock(imageWidth, imageHeight, block) {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new RangeError("Image dimensions must be positive finite numbers");
  }
  if (!block || ![block.width, block.height, block.x, block.y].every(Number.isFinite) || block.width <= 0 || block.height <= 0) {
    throw new RangeError("Evidence block must have finite coordinates and positive dimensions");
  }

  const scale = Math.min(block.width / imageWidth, block.height / imageHeight, 1);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: block.x + Math.floor((block.width - width) / 2),
    y: block.y + Math.floor((block.height - height) / 2),
    width,
    height,
    scale,
  };
}
