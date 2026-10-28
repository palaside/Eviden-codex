export function fitChatBlock(width, height, blockWidth = 807, blockHeight = 1115) {
  if (![width, height, blockWidth, blockHeight].every(Number.isFinite)
    || width <= 0 || height <= 0 || blockWidth <= 0 || blockHeight <= 0) {
    throw new RangeError("Image and chat block dimensions must be positive finite numbers");
  }

  const scale = Math.min(blockWidth / width, blockHeight / height, 1);
  const fittedWidth = Math.max(1, Math.round(width * scale));
  const fittedHeight = Math.max(1, Math.round(height * scale));
  return {
    x: Math.floor((blockWidth - fittedWidth) / 2),
    y: 0,
    width: fittedWidth,
    height: fittedHeight,
    scale,
  };
}
