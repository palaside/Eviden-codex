/**
 * ==========================================================================
 * DICUT_CHAT DIRECT PIXEL QUIET ZONE SLICER (Canvas 2D Engine)
 * Slices long chat captures into Court A4 blocks (807 × 1115 px) in < 0.05s
 * Compliant with Dicut_Chat Skill & Anti-Bubble Cutting Rule
 * ==========================================================================
 */

import { fitChatBlock } from "./fit-chat-block.mjs";

export interface ChatSliceResult {
  sliceIndex: number;
  canvas: HTMLCanvasElement;
  startY: number;
  endY: number;
  height: number;
  contentScaleY: number;
  contentScaleX?: number;
  contentOffsetX?: number;
  streamPageNumber?: number;
  streamPageCount?: number;
  sourceSegments?: import("@/utils/stitch-chat-images").ChatStreamSourceSegment[];
  cutWarnings?: string[];
}

const BLOCK_W = 807;
const BLOCK_H = 1115;
const SINGLE_PAGE_FIT_LIMIT = 1.05;
const FEATHER_BLEND_PX = 12;
// Minimum consecutive quiet rows required for a safe cut (helps avoid cutting through chat bubbles)
const MIN_QUIET_ROWS = 6;
const LOOKAHEAD_MARGIN = 1.30; // ไม่เกิน 1.30 เท่าของความสูงบล็อก

export function isTinySinglePageOverflow(contentHeight: number): boolean {
  return contentHeight > BLOCK_H && contentHeight <= BLOCK_H * SINGLE_PAGE_FIT_LIMIT;
}

export function selectQuietCut(
  currentY: number,
  effectiveH: number,
  quietCuts: number[],
  isQuietRow: boolean[],
): { cutPoint: number; shouldShrink: boolean; forcedThroughContent: boolean } {
  const minTarget = currentY + Math.round(BLOCK_H * 0.65);
  const target = currentY + BLOCK_H;
  const maxLookahead = Math.min(effectiveH, currentY + Math.round(BLOCK_H * LOOKAHEAD_MARGIN));
  const lookaheadCandidates = quietCuts.filter((cut) => cut >= target && cut <= maxLookahead);
  const standardCandidates = quietCuts.filter((cut) => cut >= minTarget && cut < target);
  let cutPoint: number;
  let shouldShrink = false;

  if (lookaheadCandidates.length && standardCandidates.length) {
    cutPoint = lookaheadCandidates[0];
    shouldShrink = true;
  } else if (lookaheadCandidates.length) {
    cutPoint = lookaheadCandidates[0];
    shouldShrink = true;
  } else if (standardCandidates.length) {
    cutPoint = standardCandidates[standardCandidates.length - 1];
  } else {
    const broadCandidates = quietCuts.filter((cut) =>
      cut >= currentY + Math.round(BLOCK_H * 0.5) && cut <= Math.min(effectiveH, maxLookahead + 100));
    if (broadCandidates.length) {
      cutPoint = broadCandidates.reduce((best, candidate) =>
        Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best);
      shouldShrink = cutPoint - currentY > BLOCK_H;
    } else {
      cutPoint = target;
      for (let y = Math.min(effectiveH - 1, target); y >= minTarget; y--) {
        if (isQuietRow[y]) {
          cutPoint = y;
          break;
        }
      }
    }
  }

  if (cutPoint <= currentY) cutPoint = Math.min(effectiveH, currentY + BLOCK_H);
  return {
    cutPoint,
    shouldShrink,
    forcedThroughContent: cutPoint < effectiveH && !isQuietRow[cutPoint],
  };
}

/**
 * Robust Quiet Zone Detection Algorithm (Direct Port from Dicut_Chat process_chat.py)
 * Guarantees NO cutting through chat bubbles, stickers, or text.
 * Search Range: 0.65x (725px) to 1.30x (1450px)
 */

/**
 * Analyze all horizontal scanlines across the image to classify quiet rows.
 * Content pixels: high contrast with background wallpaper, sharp edges (text, bubble borders, avatar).
 */
function analyzeQuietScanlines(
  data: Uint8ClampedArray,
  width: number,
  height: number
): boolean[] {
  const isQuietRow = new Array<boolean>(height).fill(false);
  const leftMarginEnd = Math.min(30, Math.floor(width * 0.05));
  const rightMarginStart = Math.max(width - 30, Math.floor(width * 0.95));

  for (let y = 0; y < height; y++) {
    // 1. Sample background color from left & right margins of this row
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    for (let x = 5; x < leftMarginEnd; x += 4) {
      const idx = (y * width + x) * 4;
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
      bgCount++;
    }
    for (let x = rightMarginStart; x < width - 5; x += 4) {
      const idx = (y * width + x) * 4;
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
      bgCount++;
    }
    if (bgCount > 0) {
      bgR = Math.round(bgR / bgCount);
      bgG = Math.round(bgG / bgCount);
      bgB = Math.round(bgB / bgCount);
    }

    // 2. Count content pixels in the central chat zone (excluding outer margins)
    let contentCount = 0;
    const startX = 35;
    const endX = width - 35;
    const stepX = 4; // Sample every 4px

    for (let x = startX; x < endX; x += stepX) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Difference from margin background
      const diffBg = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

      // Horizontal edge with adjacent pixel (text/bubble edge contrast)
      const prevIdx = (y * width + (x - stepX)) * 4;
      const edge = Math.abs(r - data[prevIdx]) + Math.abs(g - data[prevIdx + 1]) + Math.abs(b - data[prevIdx + 2]);

      // High luminance bubble body or dark text
      const isWhiteBubble = r > 240 && g > 240 && b > 240;
      const isDarkText = r < 100 && g < 100 && b < 100;

      if (diffBg > 45 || edge > 35 || (isWhiteBubble && bgR < 225) || isDarkText) {
        contentCount++;
      }
    }

    // A row is considered quiet if content pixel count is minimal (< 6 sampled pixels out of ~185 samples)
    isQuietRow[y] = contentCount < 6;
  }

  return isQuietRow;
}

/**
 * Group consecutive quiet rows into safe cut bands (Safety Threshold >= 6px)
 */
export function findQuietCutBands(isQuietRow: boolean[], height: number, minBand: number = MIN_QUIET_ROWS): number[] {
  const cutPoints: number[] = [];
  let streakStart = -1;

  for (let y = 0; y < height; y++) {
    if (isQuietRow[y]) {
      if (streakStart === -1) streakStart = y;
    } else {
      if (streakStart !== -1) {
        const bandLength = y - streakStart;
        if (bandLength >= minBand) {
          // Mid-point of the quiet band is safest
          cutPoints.push(Math.floor((streakStart + y - 1) / 2));
        }
        streakStart = -1;
      }
    }
  }

  if (streakStart !== -1 && (height - streakStart) >= minBand) {
    cutPoints.push(Math.floor((streakStart + height - 1) / 2));
  }

  return cutPoints;
}

/**
 * Strips solid dark/black horizontal bars (like Android navigation bar/home indicators
 * or shadow seams) from the top and bottom of screenshot images before slicing.
 * Direct Port from Dicut_Chat process_chat.py (strip_dark_edge_bands)
 */
/**
 * Strips solid dark/black horizontal bars (like Android navigation bar/home indicators
 * or shadow seams) from the top and bottom of screenshot images before slicing.
 * Direct Port from Dicut_Chat process_chat.py (strip_dark_edge_bands) with 4px micro-trim
 */
function getCleanVerticalBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxRows: number = 90
): { topCut: number; botCut: number } {
  // Sample middle background luminance to detect relative darkness
  const midY = Math.floor(height / 2);
  let bgLumSum = 0;
  let bgCount = 0;
  for (let dy = -10; dy <= 10; dy += 2) {
    const y = Math.max(0, Math.min(height - 1, midY + dy));
    for (const x of [12, 24, width - 24, width - 12]) {
      const idx = (y * width + x) * 4;
      bgLumSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      bgCount++;
    }
  }
  const avgBgLum = bgCount > 0 ? bgLumSum / bgCount : 200;
  const darkThresh = Math.min(130, Math.max(75, avgBgLum - 35));

  let topCut = 0;
  for (let y = 0; y < Math.min(maxRows, height); y++) {
    let rowLum = 0;
    const step = 4;
    let count = 0;
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      rowLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      count++;
    }
    if (rowLum / count < darkThresh) {
      topCut = y + 1;
    } else {
      break;
    }
  }
  if (topCut > 0) {
    topCut = Math.min(height, topCut + 4); // 4px micro-trim per Dicut_Chat / process_chat.py
  }

  let botCut = height;
  for (let y = height - 1; y >= Math.max(height - 1 - maxRows, 0); y--) {
    let rowLum = 0;
    const step = 4;
    let count = 0;
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      rowLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      count++;
    }
    if (rowLum / count < darkThresh) {
      botCut = y;
    } else {
      break;
    }
  }
  if (botCut < height) {
    botCut = Math.max(0, botCut - 4); // 4px micro-trim upward to strip divider hairline / anti-aliasing
  }

  return { topCut, botCut };
}

/**
 * Sample the exact local wallpaper background color near a cut row
 * Prevents color step/seam between image edge and padded canvas space
 */
function sampleLocalBgColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetY: number
): { r: number; g: number; b: number; css: string } {
  const safeY = Math.max(0, Math.min(height - 1, Math.round(targetY)));
  const samples: [number, number, number][] = [];

  for (let dy = -4; dy <= 0; dy++) {
    const y = Math.max(0, Math.min(height - 1, safeY + dy));
    for (const x of [10, 16, 22, width - 22, width - 16, width - 10]) {
      const idx = (y * width + x) * 4;
      samples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255, css: "rgb(255, 255, 255)" };
  }

  const avgR = Math.round(samples.reduce((s, c) => s + c[0], 0) / samples.length);
  const avgG = Math.round(samples.reduce((s, c) => s + c[1], 0) / samples.length);
  const avgB = Math.round(samples.reduce((s, c) => s + c[2], 0) / samples.length);

  return { r: avgR, g: avgG, b: avgB, css: `rgb(${avgR}, ${avgG}, ${avgB})` };
}

/**
 * Feather Blend Seam (Alpha Gradient per Dicut_Chat and Delete_BG-Skill standards)
 * Dissolves the bottom cut edge into the background to completely remove any 1px hairline or JPEG artifact
 */
export function applyFeatherBlendSeam(
  ctx: CanvasRenderingContext2D,
  width: number,
  sliceH: number,
  bg: { r: number; g: number; b: number },
  blendPx: number = FEATHER_BLEND_PX
) {
  if (sliceH <= blendPx) return;
  const grad = ctx.createLinearGradient(0, sliceH - blendPx, 0, sliceH);
  grad.addColorStop(0, `rgba(${bg.r}, ${bg.g}, ${bg.b}, 0)`);
  grad.addColorStop(1, `rgba(${bg.r}, ${bg.g}, ${bg.b}, 1)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, sliceH - blendPx, width, blendPx);
}

/**
 * Sample the chat wallpaper background color from corner & margin pixels
 * Prevents white voids/gutters per Dicut_Chat and slip-block-fit standards
 */
function getChatBackgroundColor(data: Uint8ClampedArray, width: number, height: number): string {
  const samples: [number, number, number][] = [];
  const coords = [
    [10, 10], [width - 15, 10],
    [10, Math.min(50, height - 1)], [width - 15, Math.min(50, height - 1)],
    [15, Math.floor(height / 2)], [width - 15, Math.floor(height / 2)]
  ];
  for (const [x, y] of coords) {
    if (x < width && y < height) {
      const idx = (y * width + x) * 4;
      samples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }
  if (samples.length === 0) return "#FFFFFF";
  const avgR = Math.round(samples.reduce((s, c) => s + c[0], 0) / samples.length);
  const avgG = Math.round(samples.reduce((s, c) => s + c[1], 0) / samples.length);
  const avgB = Math.round(samples.reduce((s, c) => s + c[2], 0) / samples.length);
  return `rgb(${avgR}, ${avgG}, ${avgB})`;
}

/**
 * Direct Pixel Slicing on Canvas 2D (Pure Local Execution < 0.05s)
 * Strict implementation of Dicut_Chat (Pull -> Shrink -> Pack)
 */
export async function sliceChatImageLocally(
  imageSource: HTMLImageElement | HTMLCanvasElement | File
): Promise<ChatSliceResult[]> {
  let img: HTMLImageElement | null = null;
  let sourceCanvas: HTMLCanvasElement | null = null;
  let objectUrlToRevoke: string | null = null;

  if (imageSource instanceof File) {
    const loadedImage = new Image();
    objectUrlToRevoke = URL.createObjectURL(imageSource);
    await new Promise<void>((resolve, reject) => {
      loadedImage.onload = () => resolve();
      loadedImage.onerror = () => reject(new Error("Failed to load chat image file"));
      loadedImage.src = objectUrlToRevoke!;
    });
    img = loadedImage;
  } else if (typeof HTMLCanvasElement !== "undefined" && imageSource instanceof HTMLCanvasElement) {
    sourceCanvas = imageSource;
  } else {
    const imageElement = imageSource as HTMLImageElement;
    if (!imageElement.complete) {
      await new Promise<void>((resolve, reject) => {
        imageElement.onload = () => resolve();
        imageElement.onerror = () => reject(new Error("Failed to load chat image element"));
      });
    }
    img = imageElement;
  }

  try {
    const srcW = sourceCanvas?.width || img!.naturalWidth || img!.width;
    const srcH = sourceCanvas?.height || img!.naturalHeight || img!.height;

    // Scale width to fit BLOCK_W (807 px)
    const scale = BLOCK_W / srcW;
    const scaledH = Math.round(srcH * scale);

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = BLOCK_W;
    scaledCanvas.height = scaledH;
    const sCtx = scaledCanvas.getContext("2d", { willReadFrequently: true });
    if (!sCtx) return [];

    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = "high";
    sCtx.drawImage(sourceCanvas || img!, 0, 0, BLOCK_W, scaledH);

    const rawData = sCtx.getImageData(0, 0, BLOCK_W, scaledH);
    
    // Strip black edge bands (like Android navigation bar / home indicators)
    const { topCut, botCut } = getCleanVerticalBounds(rawData.data, BLOCK_W, scaledH);
    const chatBgColor = getChatBackgroundColor(rawData.data, BLOCK_W, scaledH);

    const isQuietRow = analyzeQuietScanlines(rawData.data, BLOCK_W, scaledH);
    const quietCuts = findQuietCutBands(isQuietRow, scaledH, MIN_QUIET_ROWS);

    const slices: ChatSliceResult[] = [];
    let currentY = topCut;
    let sliceNum = 1;
    const effectiveH = botCut;
    const contentHeight = effectiveH - topCut;

    if (isTinySinglePageOverflow(contentHeight)) {
      const targetCanvas = document.createElement("canvas");
      targetCanvas.width = BLOCK_W;
      targetCanvas.height = BLOCK_H;
      const tCtx = targetCanvas.getContext("2d");
      const fit = fitChatBlock(BLOCK_W, contentHeight, BLOCK_W, BLOCK_H);
      if (tCtx) {
        tCtx.fillStyle = chatBgColor;
        tCtx.fillRect(0, 0, BLOCK_W, BLOCK_H);
        tCtx.drawImage(scaledCanvas, 0, topCut, BLOCK_W, contentHeight, fit.x, fit.y, fit.width, fit.height);
      }
      return [{
        sliceIndex: 1,
        canvas: targetCanvas,
        startY: topCut,
        endY: effectiveH,
        height: contentHeight,
        contentScaleY: contentHeight / fit.height,
        contentScaleX: BLOCK_W / fit.width,
        contentOffsetX: fit.x,
      }];
    }

    while (currentY < effectiveH) {
      const remainingH = effectiveH - currentY;

      if (remainingH <= BLOCK_H) {
        // Last slice fits fully into BLOCK_H
        const localBg = sampleLocalBgColor(rawData.data, BLOCK_W, scaledH, effectiveH - 1);
        const targetCanvas = document.createElement("canvas");
        targetCanvas.width = BLOCK_W;
        targetCanvas.height = BLOCK_H;
        const tCtx = targetCanvas.getContext("2d");
        if (tCtx) {
          tCtx.fillStyle = localBg.css || chatBgColor;
          tCtx.fillRect(0, 0, BLOCK_W, BLOCK_H);
          tCtx.drawImage(scaledCanvas, 0, currentY, BLOCK_W, remainingH, 0, 0, BLOCK_W, remainingH);

          // Feather Blend Seam: smoothly dissolve the bottom edge into localBg
          if (remainingH < BLOCK_H) {
            applyFeatherBlendSeam(tCtx, BLOCK_W, remainingH, localBg);
          }
        }

        slices.push({
          sliceIndex: sliceNum,
          canvas: targetCanvas,
          startY: currentY,
          endY: effectiveH,
          height: remainingH,
          contentScaleY: 1,
        });
        break;
      }

      const cutDecision = selectQuietCut(currentY, effectiveH, quietCuts, isQuietRow);
      const { cutPoint, shouldShrink } = cutDecision;

      const rawSliceH = cutPoint - currentY;
      const localBg = sampleLocalBgColor(rawData.data, BLOCK_W, scaledH, cutPoint - 1);
      const targetCanvas = document.createElement("canvas");
      targetCanvas.width = BLOCK_W;
      targetCanvas.height = BLOCK_H;
      const tCtx = targetCanvas.getContext("2d");
      let contentScaleY = 1;
      let contentScaleX = 1;
      let contentOffsetX = 0;

      if (tCtx) {
        tCtx.fillStyle = localBg.css || chatBgColor;
        tCtx.fillRect(0, 0, BLOCK_W, BLOCK_H);

        if (shouldShrink && rawSliceH > BLOCK_H) {
          const fit = fitChatBlock(BLOCK_W, rawSliceH, BLOCK_W, BLOCK_H);
          tCtx.drawImage(scaledCanvas, 0, currentY, BLOCK_W, rawSliceH, fit.x, fit.y, fit.width, fit.height);
          contentScaleY = rawSliceH / fit.height;
          contentScaleX = BLOCK_W / fit.width;
          contentOffsetX = fit.x;
        } else {
          // Top-align unscaled, seamlessly blending with localBg at bottom
          tCtx.drawImage(scaledCanvas, 0, currentY, BLOCK_W, rawSliceH, 0, 0, BLOCK_W, rawSliceH);

          // Feather Blend Seam: smoothly dissolve the bottom edge into localBg
          if (rawSliceH < BLOCK_H) {
            applyFeatherBlendSeam(tCtx, BLOCK_W, rawSliceH, localBg);
          }
        }
      }

      slices.push({
        sliceIndex: sliceNum,
        canvas: targetCanvas,
        startY: currentY,
        endY: cutPoint,
        height: rawSliceH,
        contentScaleY,
        contentScaleX,
        contentOffsetX,
        ...(cutDecision.forcedThroughContent ? {
          cutWarnings: [`หน้าแชท ${sliceNum}: ไม่พบ quiet zone ใกล้จุดตัด; ระบบตัดตามขนาดหน้าและอาจผ่านข้อความ/วัตถุ โปรดตรวจภาพต้นฉบับ`],
        } : {}),
      });

      currentY = cutPoint;
      sliceNum++;
    }

    return slices;
  } finally {
    if (objectUrlToRevoke) {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
  }
}
