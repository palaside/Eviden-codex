function medianOfFive(values, a, b, c, d, e) {
  values[0] = a;
  values[1] = b;
  values[2] = c;
  values[3] = d;
  values[4] = e;
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    let cursor = index - 1;
    while (cursor >= 0 && values[cursor] > value) {
      values[cursor + 1] = values[cursor];
      cursor -= 1;
    }
    values[cursor + 1] = value;
  }
  return values[2];
}

export function getOcrEnhancementScale(width, height, maxScale = 2.5, maxDimension = 1800) {
  if (![width, height, maxScale, maxDimension].every(Number.isFinite)
    || width <= 0 || height <= 0 || maxScale <= 0 || maxDimension <= 0) {
    throw new RangeError("OCR crop dimensions and scale limits must be positive finite numbers");
  }
  return Math.min(maxScale, maxDimension / Math.max(width, height));
}

function getPixel(pixels, width, height, x, y) {
  const safeX = Math.max(0, Math.min(width - 1, x));
  const safeY = Math.max(0, Math.min(height - 1, y));
  return pixels[safeY * width + safeX];
}

const BILATERAL_SPATIAL_WEIGHTS = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].map((dx) => Math.exp(-(dx * dx + dy * dy) / 2)),
);
const BILATERAL_RANGE_WEIGHTS = Float64Array.from({ length: 256 }, (_, difference) =>
  Math.exp(-(difference * difference) / (2 * 24 * 24)),
);

export function bilateralDenoiseOcrPixels(pixels, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height !== pixels.length) {
    throw new Error("Bilateral denoise dimensions must match grayscale pixel buffer");
  }
  const output = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = pixels[y * width + x];
      let weightedTotal = center;
      let weightTotal = 1;
      let kernelIndex = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            kernelIndex += 1;
            continue;
          }
          const neighbor = getPixel(pixels, width, height, x + dx, y + dy);
          const weight = BILATERAL_SPATIAL_WEIGHTS[kernelIndex]
            * BILATERAL_RANGE_WEIGHTS[Math.abs(center - neighbor)];
          weightedTotal += neighbor * weight;
          weightTotal += weight;
          kernelIndex += 1;
        }
      }
      output[y * width + x] = Math.round(weightedTotal / weightTotal);
    }
  }
  return output;
}

function buildClaheLuts(pixels, width, height, tileSize = 32, clipFactor = 3) {
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  return Array.from({ length: rows * columns }, (_, tileIndex) => {
    const tileX = tileIndex % columns;
    const tileY = Math.floor(tileIndex / columns);
    const left = tileX * tileSize;
    const top = tileY * tileSize;
    const right = Math.min(width, left + tileSize);
    const bottom = Math.min(height, top + tileSize);
    const area = (right - left) * (bottom - top);
    const histogram = new Uint32Array(256);
    let tileMin = 255;
    let tileMax = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const value = pixels[y * width + x];
        histogram[value] += 1;
        tileMin = Math.min(tileMin, value);
        tileMax = Math.max(tileMax, value);
      }
    }
    if (tileMax - tileMin <= 2) return Uint8Array.from({ length: 256 }, (_, value) => value);

    const clipLimit = Math.max(1, Math.floor(clipFactor * area / 256));
    let excess = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      if (histogram[value] <= clipLimit) continue;
      excess += histogram[value] - clipLimit;
      histogram[value] = clipLimit;
    }
    const evenShare = Math.floor(excess / histogram.length);
    if (evenShare) {
      for (let value = 0; value < histogram.length; value += 1) histogram[value] += evenShare;
    }
    const remainder = excess - evenShare * histogram.length;
    const stride = remainder ? Math.max(1, Math.floor(histogram.length / remainder)) : histogram.length;
    for (let value = 0, distributed = 0; value < histogram.length && distributed < remainder; value += stride, distributed += 1) {
      histogram[value] += 1;
    }

    const lut = new Uint8Array(256);
    let cumulative = 0;
    let firstNonZero = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      cumulative += histogram[value];
      if (firstNonZero === 0 && cumulative > 0) firstNonZero = cumulative;
      lut[value] = Math.round(255 * Math.max(0, cumulative - firstNonZero) / Math.max(1, area - firstNonZero));
    }
    return lut;
  });
}

function applyClahe(pixels, width, height) {
  const tileSize = 32;
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const luts = buildClaheLuts(pixels, width, height, tileSize);
  const output = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    const tileY = (y + 0.5) / tileSize - 0.5;
    const y0 = Math.max(0, Math.min(rows - 1, Math.floor(tileY)));
    const y1 = Math.min(rows - 1, y0 + 1);
    const yWeight = Math.max(0, Math.min(1, tileY - Math.floor(tileY)));
    for (let x = 0; x < width; x += 1) {
      const tileX = (x + 0.5) / tileSize - 0.5;
      const x0 = Math.max(0, Math.min(columns - 1, Math.floor(tileX)));
      const x1 = Math.min(columns - 1, x0 + 1);
      const xWeight = Math.max(0, Math.min(1, tileX - Math.floor(tileX)));
      const value = pixels[y * width + x];
      const topLeft = luts[y0 * columns + x0][value];
      const topRight = luts[y0 * columns + x1][value];
      const bottomLeft = luts[y1 * columns + x0][value];
      const bottomRight = luts[y1 * columns + x1][value];
      const topValue = topLeft + (topRight - topLeft) * xWeight;
      const bottomValue = bottomLeft + (bottomRight - bottomLeft) * xWeight;
      const mapped = topValue + (bottomValue - topValue) * yWeight;
      output[y * width + x] = Math.round(value * 0.65 + mapped * 0.35);
    }
  }
  return output;
}

export function enhanceOcrPixels(pixels, width = Math.floor(pixels.length / 4), height = 1) {
  if (pixels.length % 4 !== 0) throw new Error("OCR enhancement requires an RGBA pixel buffer");
  const pixelCount = pixels.length / 4;
  const output = new Uint8ClampedArray(pixels);
  if (!pixelCount) return { pixels: output, meanBefore: 0, meanAfter: 0, gamma: 1, stages: [] };
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height !== pixelCount) {
    throw new Error("OCR enhancement dimensions must match RGBA pixel buffer");
  }

  let totalLuminance = 0;
  for (let offset = 0; offset < pixelCount * 4; offset += 4) {
    totalLuminance += 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
  }
  const meanBefore = totalLuminance / pixelCount;
  const meanRatio = meanBefore / 255;
  const gamma = meanRatio <= 0 || meanRatio >= 1
    ? 1
    : Math.max(0.65, Math.min(1.35, Math.log(0.58) / Math.log(meanRatio)));

  const normalized = new Uint8Array(pixelCount);
  for (let offset = 0; offset < pixelCount * 4; offset += 4) {
    const luminance = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
    normalized[offset / 4] = Math.round(255 * Math.pow(luminance / 255, gamma));
  }

  const denoised = new Uint8Array(pixelCount);
  const medianBuffer = new Uint8Array(5);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = getPixel(normalized, width, height, x, y);
      denoised[y * width + x] = medianOfFive(medianBuffer,
        center,
        getPixel(normalized, width, height, x - 1, y),
        getPixel(normalized, width, height, x + 1, y),
        getPixel(normalized, width, height, x, y - 1),
        getPixel(normalized, width, height, x, y + 1),
      );
    }
  }

  const edgePreserved = bilateralDenoiseOcrPixels(denoised, width, height);
  const contrasted = applyClahe(edgePreserved, width, height);
  let enhancedTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let neighborTotal = 0;
      let neighborCount = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const neighbor = getPixel(contrasted, width, height, x + dx, y + dy);
          neighborTotal += neighbor;
          neighborCount += 1;
        }
      }
      const localMean = neighborTotal / neighborCount;
      const localContrast = contrasted[index];
      const normalizedPixel = normalized[index];
      const highlightCap = normalizedPixel >= 240 ? normalizedPixel : 255;
      const sharpened = Math.max(0, Math.min(
        highlightCap,
        Math.round(localContrast + (localContrast - localMean) * 0.35),
      ));
      const offset = index * 4;
      const originalLuminance = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
      const finalValue = meanBefore < 128 && originalLuminance <= meanBefore
        ? Math.max(normalizedPixel, sharpened)
        : sharpened;
      output[offset] = finalValue;
      output[offset + 1] = finalValue;
      output[offset + 2] = finalValue;
      enhancedTotal += finalValue;
    }
  }

  return {
    pixels: output,
    meanBefore,
    meanAfter: enhancedTotal / pixelCount,
    gamma,
    stages: ["gamma_normalization", "median_denoise", "bilateral_denoise", "clahe_contrast", "unsharp_mask"],
  };
}
