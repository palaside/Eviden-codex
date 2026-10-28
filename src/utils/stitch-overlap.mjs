/**
 * Finds a high-confidence vertical overlap between two grayscale preview rasters.
 * Callers should use a downscaled copy of the source images and retain originals.
 */
export function findVerticalOverlap(previous, next, options = {}) {
  const {
    minOverlapRows = 48,
    maxOverlapRatio = 0.65,
    maxMeanAbsoluteError = 10,
    ambiguityMargin = 1.5,
    maxBrightnessOffset = 24,
  } = options;
  if (!isValidRaster(previous) || !isValidRaster(next) || previous.width !== next.width) return null;

  const maxRows = Math.min(
    previous.height - 1,
    next.height - 1,
    Math.floor(Math.min(previous.height, next.height) * maxOverlapRatio),
  );
  if (maxRows < minOverlapRows) return null;

  const candidates = [];
  for (let overlapRows = minOverlapRows; overlapRows <= maxRows; overlapRows++) {
    let samples = 0;
    const previousStart = previous.height - overlapRows;
    const differenceHistogram = new Uint32Array(511);
    for (let y = 0; y < overlapRows; y += 1) {
      for (let x = 0; x < previous.width; x += 2) {
        const difference = previous.data[(previousStart + y) * previous.width + x]
          - next.data[y * next.width + x];
        differenceHistogram[difference + 255] += 1;
        samples += 1;
      }
    }
    const medianIndex = Math.floor((samples - 1) / 2);
    let medianPosition = 0;
    let appliedBrightnessOffset = 0;
    for (let index = 0; index < differenceHistogram.length; index += 1) {
      medianPosition += differenceHistogram[index];
      if (medianPosition > medianIndex) {
        const medianDifference = index - 255;
        if (Math.abs(medianDifference) <= maxBrightnessOffset) appliedBrightnessOffset = medianDifference;
        break;
      }
    }

    let errorTotal = 0;
    for (let y = 0; y < overlapRows; y += 1) {
      for (let x = 0; x < previous.width; x += 2) {
        const difference = previous.data[(previousStart + y) * previous.width + x]
          - next.data[y * next.width + x];
        errorTotal += Math.abs(difference - appliedBrightnessOffset);
      }
    }
    candidates.push({
      overlapRows,
      meanAbsoluteError: errorTotal / samples,
      appliedBrightnessOffset,
    });
  }

  candidates.sort((left, right) => left.meanAbsoluteError - right.meanAbsoluteError);
  const best = candidates[0];
  const runnerUp = candidates.find((candidate) => Math.abs(candidate.overlapRows - best.overlapRows) > 1);
  if (best.meanAbsoluteError > maxMeanAbsoluteError) return null;
  if (runnerUp && runnerUp.meanAbsoluteError - best.meanAbsoluteError < ambiguityMargin) return null;

  return {
    overlapRows: best.overlapRows,
    meanAbsoluteError: Number(best.meanAbsoluteError.toFixed(3)),
    pixelSimilarity: Number(Math.max(0, 1 - best.meanAbsoluteError / 255).toFixed(4)),
    appliedBrightnessOffset: best.appliedBrightnessOffset,
  };
}

function isValidRaster(raster) {
  return Number.isInteger(raster?.width)
    && Number.isInteger(raster?.height)
    && raster.width > 0
    && raster.height > 0
    && raster.data?.length === raster.width * raster.height;
}
