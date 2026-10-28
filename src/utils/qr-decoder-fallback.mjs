/** Try the existing fast decoder first and invoke the alternate decoder only on a miss. */
export function formatQrDecoderRoute(result) {
  const decoder = result.decoder === "primary" ? "jsQR" : "ZXing";
  if (result.enhanced) return `${decoder}/enhanced${result.resolution === "upscaled" ? "-upscaled" : ""}`;
  return `${decoder}/${result.resolution}`;
}

export async function decodeQrWithEnhancedPixels(pixels, width, height, enhance, decode) {
  const enhanced = enhance(pixels, width, height);
  if (!enhanced?.pixels || enhanced.pixels.length !== pixels.length) {
    throw new RangeError("Enhanced QR pixels must preserve the source dimensions");
  }
  const decoded = await decode(enhanced.pixels, width, height);
  return {
    result: decoded?.data && decoded.location ? { ...decoded, enhanced: true } : null,
    pixels: enhanced.pixels,
    stages: enhanced.stages ?? [],
  };
}

export function buildQrDecoderDiagnostics(routes) {
  return [...new Set(routes.filter(Boolean))]
    .map((route) => `QR decoder route: ${route} (diagnostic only)`);
}

export function scaleQrPixelsNearest(pixels, width, height, scale) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || pixels.length !== width * height * 4 || !Number.isFinite(scale) || scale <= 1) {
    throw new RangeError("Invalid QR pixel dimensions or scale");
  }
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  const output = new Uint8ClampedArray(new ArrayBuffer(scaledWidth * scaledHeight * 4));
  for (let y = 0; y < scaledHeight; y += 1) {
    const sourceRow = Math.min(height - 1, Math.floor(y / scale)) * width * 4;
    const targetRow = y * scaledWidth * 4;
    for (let x = 0; x < scaledWidth; x += 1) {
      const source = sourceRow + Math.min(width - 1, Math.floor(x / scale)) * 4;
      const target = targetRow + x * 4;
      output[target] = pixels[source];
      output[target + 1] = pixels[source + 1];
      output[target + 2] = pixels[source + 2];
      output[target + 3] = pixels[source + 3];
    }
  }
  return { data: output, width: scaledWidth, height: scaledHeight };
}

export function cropQrPixelRegion(pixels, width, height, region) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || pixels.length !== width * height * 4
    || !Number.isInteger(region.x) || !Number.isInteger(region.y)
    || !Number.isInteger(region.width) || !Number.isInteger(region.height)
    || region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1
    || region.x + region.width > width || region.y + region.height > height) {
    throw new RangeError("Invalid QR pixel region");
  }
  const data = new Uint8ClampedArray(new ArrayBuffer(region.width * region.height * 4));
  for (let y = 0; y < region.height; y += 1) {
    const sourceStart = ((region.y + y) * width + region.x) * 4;
    data.set(pixels.subarray(sourceStart, sourceStart + region.width * 4), y * region.width * 4);
  }
  return { data, width: region.width, height: region.height };
}

export function thresholdQrPixelsOtsu(pixels, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || pixels.length !== width * height * 4) {
    throw new RangeError("Invalid QR pixel dimensions");
  }

  const histogram = new Uint32Array(256);
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    const value = Math.round(pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114);
    gray[i] = value;
    histogram[value] += 1;
  }

  let totalWeighted = 0;
  for (let value = 0; value < histogram.length; value += 1) totalWeighted += value * histogram[value];
  let backgroundWeight = 0;
  let backgroundWeighted = 0;
  let bestVariance = -1;
  let threshold = 127;
  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = gray.length - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundWeighted += value * histogram[value];
    const meanBackground = backgroundWeighted / backgroundWeight;
    const meanForeground = (totalWeighted - backgroundWeighted) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }

  const data = new Uint8ClampedArray(new ArrayBuffer(pixels.length));
  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i] <= threshold ? 0 : 255;
    const offset = i * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { data, width, height, threshold };
}

export async function decodeQrWithFallback(primaryDecode, fallbackDecode) {
  try {
    const primary = await primaryDecode();
    if (primary?.data && primary.location) {
      return { ...primary, source: "primary", decoder: "primary", resolution: "original" };
    }
  } catch {
    // A decoder error is treated as a miss so the alternate local decoder can run.
  }

  try {
    const fallback = await fallbackDecode();
    if (fallback?.data && fallback.location) {
      return { ...fallback, source: "fallback", decoder: "fallback", resolution: "original" };
    }
  } catch {
    // Keep the caller's existing no-QR behavior when neither decoder succeeds.
  }

  return null;
}

export async function decodeQrWithUpscaleFallback(
  primaryDecode,
  fallbackDecode,
  upscaledPrimaryDecode,
  upscaledFallbackDecode,
  scale,
) {
  const original = await decodeQrWithFallback(primaryDecode, fallbackDecode);
  if (original) return original;
  if (!Number.isFinite(scale) || scale <= 1) return null;

  const upscaled = await decodeQrWithFallback(upscaledPrimaryDecode, upscaledFallbackDecode);
  if (!upscaled) return null;

  const mapPoint = (point) => ({ x: point.x / scale, y: point.y / scale });
  return {
    ...upscaled,
    source: "upscaled",
    resolution: "upscaled",
    location: {
      topLeftCorner: mapPoint(upscaled.location.topLeftCorner),
      topRightCorner: mapPoint(upscaled.location.topRightCorner),
      bottomLeftCorner: mapPoint(upscaled.location.bottomLeftCorner),
      bottomRightCorner: mapPoint(upscaled.location.bottomRightCorner),
    },
  };
}
