import { classifyChatRegion } from "./chat-semantic-heuristics.mjs";
import { createColorSeparatedOcrCandidate } from "./ocr-color-segmentation.mjs";
import { createMorphologicalSlipOcrCandidate } from "./morphological-slip-ocr.mjs";

let openCvPromise;

export async function detectChatVisualRegions(canvas, ocrLines) {
  const cv = await loadOpenCv();
  const rgbaImage = cv.imread(canvas);
  try {
    return findChatVisualRegions(cv, rgbaImage, ocrLines);
  } finally {
    rgbaImage.delete();
  }
}

export function findQrSlipObjectBounds(regions, qrBounds, imageSize) {
  const qrCenter = {
    x: qrBounds.x + qrBounds.width / 2,
    y: qrBounds.y + qrBounds.height / 2,
  };
  const imageArea = imageSize.width * imageSize.height;
  const candidates = regions.flatMap((region) => {
    const bounds = region.bounds;
    const area = bounds.width * bounds.height;
    const aspect = bounds.width / Math.max(1, bounds.height);
    const containsQr = qrCenter.x >= bounds.x && qrCenter.x <= bounds.x + bounds.width
      && qrCenter.y >= bounds.y && qrCenter.y <= bounds.y + bounds.height;
    if (!containsQr || bounds.width < qrBounds.width * 4 || bounds.height < qrBounds.height * 5
      || area < imageArea * 0.025 || area > imageArea * 0.68 || aspect < 0.22 || aspect > 1.45) return [];
    return [{ bounds, area }];
  });
  candidates.sort((left, right) => left.area - right.area);
  return candidates[0]?.bounds ?? null;
}

export async function createColorSeparatedOcrCanvas(sourceCanvas) {
  const cv = await loadOpenCv();
  const source = cv.imread(sourceCanvas);
  let candidate;
  try {
    candidate = createColorSeparatedOcrCandidate(cv, source);
    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    cv.imshow(canvas, candidate);
    return canvas;
  } finally {
    candidate?.delete();
    source.delete();
  }
}

export async function createMorphologicalSlipOcrCanvas(sourceCanvas) {
  const cv = await loadOpenCv();
  const source = cv.imread(sourceCanvas);
  let candidate;
  try {
    candidate = createMorphologicalSlipOcrCandidate(cv, source);
    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    cv.imshow(canvas, candidate);
    return canvas;
  } finally {
    candidate?.delete();
    source.delete();
  }
}

export function findChatVisualRegions(cv, rgbaImage, ocrLines) {
  const gray = new cv.Mat();
  const mask = new cv.Mat();
  const closedMask = new cv.Mat();
  const rgbImage = new cv.Mat();
  const hsvImage = new cv.Mat();
  const labImage = new cv.Mat();
  const hsvMask = new cv.Mat();
  const hsvLower = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC3, new cv.Scalar(0, 35, 24));
  const hsvUpper = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC3, new cv.Scalar(180, 255, 245));
  const labMask = new cv.Mat();
  const colorMask = new cv.Mat();
  const closedColorMask = new cv.Mat();
  const lowAMask = new cv.Mat();
  const highAMask = new cv.Mat();
  const lowBMask = new cv.Mat();
  const highBMask = new cv.Mat();
  const aMask = new cv.Mat();
  const bMask = new cv.Mat();
  const lowRange = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(0));
  const lowNeutral = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(115));
  const highNeutral = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(141));
  const highRange = new cv.Mat(rgbaImage.rows, rgbaImage.cols, cv.CV_8UC1, new cv.Scalar(255));
  const labChannels = new cv.MatVector();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernelWidth = oddBound(Math.round(rgbaImage.cols * 0.014), 5, 17);
  const kernelHeight = oddBound(Math.round(rgbaImage.rows * 0.01), 3, 13);
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelWidth, kernelHeight));

  try {
    cv.cvtColor(rgbaImage, gray, cv.COLOR_RGBA2GRAY);
    const blockSize = oddBound(Math.round(Math.min(rgbaImage.cols, rgbaImage.rows) * 0.035), 15, 41);
    cv.adaptiveThreshold(gray, mask, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, blockSize, 7);
    cv.morphologyEx(mask, closedMask, cv.MORPH_CLOSE, kernel);

    cv.cvtColor(rgbaImage, rgbImage, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgbImage, hsvImage, cv.COLOR_RGB2HSV);
    cv.inRange(hsvImage, hsvLower, hsvUpper, hsvMask);
    cv.cvtColor(rgbImage, labImage, cv.COLOR_RGB2Lab);
    cv.split(labImage, labChannels);
    const aChannel = labChannels.get(1);
    const bChannel = labChannels.get(2);
    try {
      cv.inRange(aChannel, lowRange, lowNeutral, lowAMask);
      cv.inRange(aChannel, highNeutral, highRange, highAMask);
      cv.inRange(bChannel, lowRange, lowNeutral, lowBMask);
      cv.inRange(bChannel, highNeutral, highRange, highBMask);
    } finally {
      aChannel.delete();
      bChannel.delete();
    }
    cv.bitwise_or(lowAMask, highAMask, aMask);
    cv.bitwise_or(lowBMask, highBMask, bMask);
    cv.bitwise_or(aMask, bMask, labMask);
    cv.bitwise_or(hsvMask, labMask, colorMask);
    cv.morphologyEx(colorMask, closedColorMask, cv.MORPH_CLOSE, kernel);

    const pageArea = rgbaImage.cols * rgbaImage.rows;
    const maskCoverage = pageArea ? cv.countNonZero(mask) / pageArea : 0;
    const colorMaskCoverage = pageArea ? cv.countNonZero(colorMask) / pageArea : 0;
    const grayscaleResult = collectContourCandidates(cv, closedMask, contours, hierarchy, ocrLines, pageArea, "opencv_adaptive_mask_contour");
    const colorResult = collectContourCandidates(cv, closedColorMask, contours, hierarchy, ocrLines, pageArea, "opencv_hsv_lab_color_mask_contour");
    const regions = grayscaleResult.regions;
    let mergedColorCount = 0;
    let colorOnlyCount = 0;
    for (const colorRegion of colorResult.regions) {
      const matchingRegion = regions.find((region) => overlapOfSmallerBox(region.bounds, colorRegion.bounds) >= 0.65);
      if (matchingRegion) {
        mergedColorCount += 1;
        matchingRegion.supportingDetectionMethods = [
          matchingRegion.detectionMethod,
          colorRegion.detectionMethod,
        ];
      } else {
        colorOnlyCount += 1;
        regions.push(colorRegion);
      }
    }
    regions.sort((left, right) => right.bounds.width * right.bounds.height - left.bounds.width * left.bounds.height);
    const needsMaskPreview = maskCoverage < 0.1 && colorMaskCoverage > 0.5;
    return {
      regions,
      maskCoverage: Number(maskCoverage.toFixed(4)),
      colorMaskCoverage: Number(colorMaskCoverage.toFixed(4)),
      contourAudit: {
        grayscale: grayscaleResult.audit,
        color: colorResult.audit,
        mergedColorCount,
        colorOnlyCount,
        finalCandidateCount: regions.length,
        morphologyKernel: { width: kernelWidth, height: kernelHeight },
        adaptiveThresholdBlockSize: blockSize,
      },
      maskPreviews: needsMaskPreview ? {
        grayscale: makeMaskPreview(cv, closedMask),
        color: makeMaskPreview(cv, closedColorMask),
      } : null,
      warning: "OpenCV grayscale + HSV/LAB color-mask contours create heuristic candidates; labels are estimates, not confirmed object classes.",
    };
  } finally {
    gray.delete();
    mask.delete();
    closedMask.delete();
    rgbImage.delete();
    hsvImage.delete();
    labImage.delete();
    hsvMask.delete();
    hsvLower.delete();
    hsvUpper.delete();
    labMask.delete();
    colorMask.delete();
    closedColorMask.delete();
    lowAMask.delete();
    highAMask.delete();
    lowBMask.delete();
    highBMask.delete();
    aMask.delete();
    bMask.delete();
    lowRange.delete();
    lowNeutral.delete();
    highNeutral.delete();
    highRange.delete();
    labChannels.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
  }
}

function collectContourCandidates(cv, mask, contours, hierarchy, ocrLines, pageArea, detectionMethod) {
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const regions = [];
  const rejectedCounts = /** @type {Record<string, number>} */ ({});
  const rejectedSamples = [];
  let totalContours = 0;
  for (let index = 0; index < contours.size(); index += 1) {
    totalContours += 1;
    const contour = contours.get(index);
    const area = cv.contourArea(contour);
    const perimeter = cv.arcLength(contour, true);
    const rect = cv.boundingRect(contour);
    contour.delete();
    const relatedLine = findRelatedOcrLine(rect, ocrLines);
    const rejectionReason = getContourRejectionReason(rect, area, pageArea, !!relatedLine);
    if (rejectionReason) {
      rejectedCounts[rejectionReason] = (rejectedCounts[rejectionReason] || 0) + 1;
      rejectedSamples.push({
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        contourArea: Number(area.toFixed(1)),
        pageAreaRatio: Number((area / Math.max(1, pageArea)).toFixed(4)),
        relatedLineIndex: relatedLine?.index ?? null,
        reason: rejectionReason,
        detectionMethod,
      });
      continue;
    }
    const semantic = classifyChatRegion({
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      contourArea: area,
      perimeter,
    }, ocrLines, { width: mask.cols, height: mask.rows });
    regions.push({
      kind: "visual_region_candidate",
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      confidence: semantic.confidence,
      needsReview: true,
      detectionMethod,
      relatedLineIndex: semantic.evidenceLineIndex ?? relatedLine?.index ?? null,
      objectTypeCandidate: semantic.semanticClass,
      semanticMethod: semantic.method,
      semanticRationale: semantic.rationale,
      foregroundRatio: Number(Math.min(1, area / Math.max(1, rect.width * rect.height)).toFixed(3)),
    });
  }
  rejectedSamples.sort((left, right) => Number(right.relatedLineIndex !== null) - Number(left.relatedLineIndex !== null)
    || right.contourArea - left.contourArea);
  return {
    regions,
    audit: {
      totalContours,
      keptCount: regions.length,
      rejectedByReason: rejectedCounts,
      rejectedSamples: rejectedSamples.slice(0, 30),
    },
  };
}

export function getContourRejectionReason(rect, area, pageArea, hasRelatedLine) {
  if (rect.width < 16 || rect.height < 10) return "below_minimum_bounds";
  if (area < Math.max(80, pageArea * 0.0008)) return "below_minimum_area";
  if (area > pageArea * 0.72) return "above_maximum_area";
  if (!hasRelatedLine && area < pageArea * 0.006) return "small_contour_without_ocr_overlap";
  return null;
}

function makeMaskPreview(cv, mask) {
  if (typeof document === "undefined") return null;
  const source = document.createElement("canvas");
  source.width = mask.cols;
  source.height = mask.rows;
  cv.imshow(source, mask);
  const scale = Math.min(1, 400 / source.width, 560 / source.height);
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.round(source.width * scale));
  preview.height = Math.max(1, Math.round(source.height * scale));
  const context = preview.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, preview.width, preview.height);
  return preview.toDataURL("image/png");
}

function overlapOfSmallerBox(left, right) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = width * height;
  const smaller = Math.min(left.width * left.height, right.width * right.height);
  return smaller ? intersection / smaller : 0;
}

function findRelatedOcrLine(rect, lines) {
  let best = null;
  for (const line of lines) {
    const intersectionWidth = Math.max(0, Math.min(rect.x + rect.width, line.bounds.x + line.bounds.width) - Math.max(rect.x, line.bounds.x));
    const intersectionHeight = Math.max(0, Math.min(rect.y + rect.height, line.bounds.y + line.bounds.height) - Math.max(rect.y, line.bounds.y));
    const lineArea = line.bounds.width * line.bounds.height;
    const overlap = lineArea ? intersectionWidth * intersectionHeight / lineArea : 0;
    if (overlap > (best?.overlap || 0.12)) best = { index: line.index, overlap };
  }
  return best;
}

function oddBound(value, min, max) {
  const bounded = Math.max(min, Math.min(max, value));
  return bounded % 2 === 0 ? bounded + (bounded < max ? 1 : -1) : bounded;
}

async function loadOpenCv() {
  openCvPromise ??= (async () => {
    let cv = globalThis.cv;
    if (!cv?.Mat) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/opencv-runtime/5.0.0-release.1";
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("โหลด OpenCV runtime ไม่สำเร็จ"));
        document.head.appendChild(script);
      });
      cv = globalThis.cv;
    }
    if (cv instanceof Promise) cv = await cv;
    if (!cv?.Mat) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("OpenCV WASM runtime เริ่มทำงานไม่ทันเวลา")), 30000);
        const onReady = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          clearTimeout(timeout);
          onReady?.();
          resolve();
        };
      });
    }
    if (!cv?.Mat) throw new Error("OpenCV runtime ไม่มี API Mat");
    return cv;
  })();
  return openCvPromise;
}
