import { findVerticalOverlap } from "./stitch-overlap.mjs";
import { detectChatChromeTrim } from "./chat-semantic-heuristics.mjs";

export interface ChatStreamInput {
  id: string;
  file: File;
  sha256: string;
  captureTime?: string | null;
  eventTime?: string | null;
  ocrLines?: Array<{ text: string; bounds: { x: number; y: number; width: number; height: number } }>;
  isFirst?: boolean;
  isLast?: boolean;
}

export interface ChatStreamSourceSegment {
  sourceItemId: string;
  sourceFileName: string;
  sourceSha256: string;
  captureTime?: string | null;
  eventTime?: string | null;
  streamStartY: number;
  streamEndY: number;
  sourceOffsetY: number;
  sourceScale: number;
  sourceTrim?: { top: number; bottom: number; topMethod: string; bottomMethod: string; topEvidence?: string | null; bottomEvidence?: string | null };
}

export interface StitchedChatStream {
  canvas: HTMLCanvasElement;
  sourceSegments: ChatStreamSourceSegment[];
  overlapJoins: Array<{
    previousFileName: string;
    nextFileName: string;
    overlapPixels: number;
    pixelSimilarity: number;
    appliedBrightnessOffset: number;
  }>;
  warnings: string[];
}

const STREAM_WIDTH = 807;
const MATCH_WIDTH = 128;
const MAX_STREAM_HEIGHT = 10000;

export async function stitchChatImages(inputs: ChatStreamInput[]): Promise<StitchedChatStream[]> {
  const streams: StitchedChatStream[] = [];
  let current: StitchedChatStream | null = null;

  for (const input of inputs) {
    const entry = await normalizeInput(input);
    if (!current) {
      current = startStream(entry);
      continue;
    }

    const overlap = detectCanvasOverlap(current.canvas, entry.canvas);
    if (!overlap) {
      streams.push({ ...current, warnings: [...current.warnings, `ไม่พบ overlap ที่ผ่านเกณฑ์กับ ${entry.input.file.name}; คงภาพแยกและไม่ตัดส่วนใด`] });
      current = startStream(entry, [`ไม่พบ overlap ที่ผ่านเกณฑ์กับภาพก่อนหน้า; คงภาพแยกและไม่ตัดส่วนใด`]);
      continue;
    }

    const previousStream: StitchedChatStream = current;
    const nextTop: number = previousStream.canvas.height - overlap.overlapPixels;
    const nextVisibleTop = nextTop + overlap.overlapPixels;
    if (nextVisibleTop + entry.canvas.height - overlap.overlapPixels > MAX_STREAM_HEIGHT) {
      streams.push({
        ...previousStream,
        warnings: [...previousStream.warnings, `แยก stream ที่ ${entry.input.file.name} เพื่อจำกัดหน่วยความจำ; รอยต่อข้าม stream นี้ไม่ได้ตัดออก`],
      });
      current = startStream(entry, [`เริ่ม stream ใหม่เพื่อจำกัดหน่วยความจำ; รอยต่อกับภาพก่อนหน้าไม่ได้ตัดออก`]);
      continue;
    }
    const joined = document.createElement("canvas");
    joined.width = STREAM_WIDTH;
    joined.height = nextTop + entry.canvas.height;
    const context = joined.getContext("2d");
    if (!context) throw new Error("เตรียมผืนภาพแชทต่อเนื่องไม่สำเร็จ");
    context.drawImage(previousStream.canvas, 0, 0);
    context.drawImage(
      entry.canvas,
      0,
      overlap.overlapPixels,
      STREAM_WIDTH,
      entry.canvas.height - overlap.overlapPixels,
      0,
      nextVisibleTop,
      STREAM_WIDTH,
      entry.canvas.height - overlap.overlapPixels,
    );

    current = {
      canvas: joined,
      sourceSegments: [
        ...previousStream.sourceSegments,
        {
          sourceItemId: entry.input.id,
          sourceFileName: entry.input.file.name,
          sourceSha256: entry.input.sha256,
          captureTime: entry.input.captureTime || null,
          eventTime: entry.input.eventTime || null,
          streamStartY: nextVisibleTop,
          streamEndY: joined.height,
          sourceOffsetY: entry.trim.top + overlap.overlapPixels,
          sourceScale: entry.sourceScale,
          sourceTrim: { ...entry.trim },
        },
      ].filter((segment) => segment.streamEndY > segment.streamStartY),
      overlapJoins: [
        ...previousStream.overlapJoins,
        {
          previousFileName: previousStream.sourceSegments.at(-1)?.sourceFileName || "",
          nextFileName: entry.input.file.name,
          overlapPixels: overlap.overlapPixels,
          pixelSimilarity: overlap.pixelSimilarity,
          appliedBrightnessOffset: overlap.appliedBrightnessOffset,
        },
      ],
      warnings: [...previousStream.warnings, ...entry.trim.warnings],
    };
  }

  if (current) streams.push(current);
  return streams;
}

async function normalizeInput(input: ChatStreamInput) {
  const bitmap = await createImageBitmap(input.file);
  const scale = STREAM_WIDTH / bitmap.width;
  const fullHeight = Math.max(1, Math.round(bitmap.height * scale));
  const scaledLines = (input.ocrLines || []).map((line) => ({
    ...line,
    bounds: {
      x: line.bounds.x * scale,
      y: line.bounds.y * scale,
      width: line.bounds.width * scale,
      height: line.bounds.height * scale,
    },
  }));
  const trim = detectChatChromeTrim(scaledLines, { width: STREAM_WIDTH, height: fullHeight }, {
    isFirst: input.isFirst ?? true,
    isLast: input.isLast ?? true,
  });
  const safeTop = Math.max(0, Math.min(fullHeight - 1, trim.top));
  const safeBottom = Math.max(safeTop + 1, Math.min(fullHeight, trim.bottom));
  const canvas = document.createElement("canvas");
  canvas.width = STREAM_WIDTH;
  canvas.height = safeBottom - safeTop;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error(`เตรียมภาพ ${input.file.name} ไม่สำเร็จ`);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, safeTop / scale, bitmap.width, (safeBottom - safeTop) / scale, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return {
    input,
    canvas,
    sourceScale: 1 / scale,
    trim: {
      top: Math.round(safeTop / scale),
      bottom: Math.round((fullHeight - safeBottom) / scale),
      topMethod: trim.topMethod,
      bottomMethod: trim.bottomMethod,
      topEvidence: trim.topEvidence,
      bottomEvidence: trim.bottomEvidence,
      warnings: trim.warnings,
    },
  };
}

function startStream(entry: Awaited<ReturnType<typeof normalizeInput>>, warnings: string[] = []): StitchedChatStream {
  return {
    canvas: entry.canvas,
    sourceSegments: [{
      sourceItemId: entry.input.id,
      sourceFileName: entry.input.file.name,
      sourceSha256: entry.input.sha256,
      captureTime: entry.input.captureTime || null,
      eventTime: entry.input.eventTime || null,
      streamStartY: 0,
      streamEndY: entry.canvas.height,
      sourceOffsetY: entry.trim.top,
      sourceScale: entry.sourceScale,
      sourceTrim: { ...entry.trim },
    }],
    overlapJoins: [],
    warnings: [...warnings, ...entry.trim.warnings],
  };
}

function detectCanvasOverlap(previous: HTMLCanvasElement, next: HTMLCanvasElement) {
  const previousMatch = makeMatchRaster(previous);
  const nextMatch = makeMatchRaster(next);
  const minOverlapRows = Math.max(20, Math.round(Math.min(previousMatch.height, nextMatch.height) * 0.12));
  const match = findVerticalOverlap(previousMatch, nextMatch, {
    minOverlapRows,
    maxOverlapRatio: 0.68,
    maxMeanAbsoluteError: 14,
    ambiguityMargin: 1.8,
  });
  if (!match) return null;
  return {
    ...match,
    overlapPixels: Math.max(1, Math.round(match.overlapRows * (STREAM_WIDTH / MATCH_WIDTH))),
  };
}

function makeMatchRaster(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = MATCH_WIDTH;
  canvas.height = Math.max(1, Math.round(source.height * MATCH_WIDTH / source.width));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("วิเคราะห์รอยต่อภาพแชทไม่สำเร็จ");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const grayscale = new Uint8Array(canvas.width * canvas.height);
  for (let pixel = 0, offset = 0; pixel < grayscale.length; pixel += 1, offset += 4) {
    grayscale[pixel] = Math.round(rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722);
  }
  return { width: canvas.width, height: canvas.height, data: grayscale };
}
