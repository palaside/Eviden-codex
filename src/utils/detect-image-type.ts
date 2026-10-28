import jsQR from "jsqr";

/**
 * Detect Skill — ตรวจสอบประเภทภาพ (TYPE_CHAT | TYPE_SLIP_SOLO | TYPE_CHAT_WITH_SLIP)
 * อ้างอิงตามมาตรฐาน skills/Detect/SKILL.md:
 * 1. TYPE_SLIP_SOLO: ภาพสลิปโอนเงินเดี่ยวเต็มใบ (มี QR Code มาตรฐาน EMVCo หรือชื่อไฟล์ระบุชัด)
 * 2. TYPE_CHAT: ภาพหน้าจอแชทบทสนทนาต่อเนื่อง (ไม่มี QR Code ธนาคาร, เป็นภาพแคปแนวยาว)
 * 3. TYPE_CHAT_WITH_SLIP: ภาพแชทยาวที่มี QR สลิปฝังอยู่
 */

export type DetectedType = 'TYPE_SLIP_SOLO' | 'TYPE_CHAT' | 'TYPE_CHAT_WITH_SLIP';

export interface DetectResult {
  type: DetectedType;
  category: 'SLIP' | 'CHAT';
  confidence: number;
}

export type FilenameClassificationHint = 'TYPE_SLIP_SOLO' | 'TYPE_CHAT' | null;

export function getFilenameClassificationHint(fileName: string): FilenameClassificationHint {
  if (/สลิป/u.test(fileName) || /(?:^|[^a-z0-9])(?:slip|receipt)(?=$|[^a-z0-9])/iu.test(fileName)) return 'TYPE_SLIP_SOLO';
  if (/แชท/u.test(fileName) || /(?:^|[^a-z0-9])(?:chatv?\d*|line|screen(?:shot)?)(?=$|[^a-z0-9])/iu.test(fileName)) return 'TYPE_CHAT';
  return null;
}

export function getQrRetryWidth(width: number, ratio: number, hasQr: boolean): number | null {
  if (hasQr || width <= 400 || !Number.isFinite(ratio) || ratio <= 0) return null;
  const maxWidthForPixelBudget = Math.floor(Math.sqrt(10_000_000 / ratio));
  return Math.min(width * 1.5, 1500, maxWidthForPixelBudget);
}

export function getQrNativeRetryWidth(
  width: number,
  height: number,
  ratio: number,
  hasQr: boolean,
): number | null {
  if (hasQr || width <= 1000 || ratio < 1.2 || ratio > 2.5 || width * height > 10_000_000) return null;
  return width;
}

export function resolveImageClassification(signals: {
  hasRealQr: boolean;
  ratio: number;
  bubbles: number;
  surroundingChatBubbles?: boolean;
  filenameHint?: FilenameClassificationHint;
}): Pick<DetectResult, 'type' | 'category'> {
  if (signals.hasRealQr) {
    if (signals.surroundingChatBubbles) {
      return { type: 'TYPE_CHAT_WITH_SLIP', category: 'CHAT' };
    }
    return (signals.ratio > 4 || (signals.ratio > 2.5 && signals.bubbles > 4))
      ? { type: 'TYPE_CHAT_WITH_SLIP', category: 'CHAT' }
      : { type: 'TYPE_SLIP_SOLO', category: 'SLIP' };
  }

  if (signals.ratio > 4) {
    return { type: 'TYPE_CHAT', category: 'CHAT' };
  }

  if (signals.ratio > 2.5 && signals.bubbles > 4) {
    return { type: 'TYPE_CHAT', category: 'CHAT' };
  }

  if (signals.filenameHint === 'TYPE_SLIP_SOLO') {
    return { type: 'TYPE_SLIP_SOLO', category: 'SLIP' };
  }
  return { type: 'TYPE_CHAT', category: 'CHAT' };
}

export function detectSurroundingChatBubbles(data: Uint8ClampedArray, width: number, height: number): boolean {
  if (width < 40 || height < 40 || data.length < width * height * 4) return false;

  const tracks: Array<{ side: 'left' | 'right'; x: number; width: number; lastY: number; rows: number }> = [];
  const rowStep = Math.max(1, Math.floor(height / 220));
  const edgeWidth = Math.max(2, Math.floor(width * 0.035));
  const minRun = Math.max(8, Math.floor(width * 0.09));
  const maxRun = Math.floor(width * 0.78);
  const maxTrackGap = Math.max(rowStep * 2, Math.floor(height * 0.018));

  for (let y = 0; y < height; y += rowStep) {
    if (y > height * 0.22 && y < height * 0.78) continue;
    const edgeSamples: number[] = [];
    for (let x = 0; x < edgeWidth; x += 1) edgeSamples.push(lumaAt(data, (y * width + x) * 4));
    for (let x = width - edgeWidth; x < width; x += 1) edgeSamples.push(lumaAt(data, (y * width + x) * 4));
    edgeSamples.sort((a, b) => a - b);
    const background = edgeSamples[Math.floor(edgeSamples.length / 2)];

    const runs: Array<{ x: number; width: number; side: 'left' | 'right' }> = [];
    let runStart = -1;
    let lastContrast = -1;
    for (let x = edgeWidth; x < width - edgeWidth; x += 1) {
      const isContrast = Math.abs(lumaAt(data, (y * width + x) * 4) - background) >= 14;
      if (isContrast) {
        if (runStart < 0) runStart = x;
        lastContrast = x;
      } else if (runStart >= 0 && x - lastContrast > 2) {
        addBubbleRun(runs, runStart, lastContrast + 1, width, minRun, maxRun);
        runStart = -1;
      }
    }
    if (runStart >= 0) addBubbleRun(runs, runStart, lastContrast + 1, width, minRun, maxRun);

    for (const run of runs) {
      const track = tracks.find((candidate) => candidate.side === run.side
        && y - candidate.lastY <= maxTrackGap
        && Math.abs(candidate.x - run.x) <= width * 0.055
        && Math.abs(candidate.width - run.width) <= width * 0.12);
      if (track) {
        track.rows += 1;
        track.lastY = y;
        track.x = (track.x + run.x) / 2;
        track.width = (track.width + run.width) / 2;
      } else {
        tracks.push({ ...run, lastY: y, rows: 1 });
      }
    }
  }

  return tracks.filter((track) => track.rows >= 3).length >= 3;
}

function addBubbleRun(
  runs: Array<{ x: number; width: number; side: 'left' | 'right' }>,
  start: number,
  end: number,
  imageWidth: number,
  minRun: number,
  maxRun: number,
) {
  const width = end - start;
  if (width < minRun || width > maxRun) return;
  const side = start / imageWidth < 0.42 ? 'left' : end / imageWidth > 0.58 ? 'right' : null;
  if (side) runs.push({ x: start, width, side });
}

function lumaAt(data: Uint8ClampedArray, offset: number) {
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
}

/**
 * นับการสลับความสว่างซ้าย-ขวาเพื่อตรวจจับแนวบับเบิ้ลข้อความแชท
 */
function detectBubblePattern(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const sampleY = Math.floor(height * 0.5);
  let transitions = 0;
  let prevBright = data[(sampleY * width + 0) * 4] > 128;
  const step = Math.max(1, Math.floor(width / 200));
  for (let x = step; x < width; x += step) {
    const bright = data[(sampleY * width + x) * 4] > 128;
    if (bright !== prevBright) {
      transitions++;
      prevBright = bright;
    }
  }
  return transitions;
}

/**
 * QR evidence outranks pixel-transition heuristics, which mistake colorful slip artwork for chat bubbles.
 */
export async function detectImageType(file: File): Promise<DetectResult> {
  const filenameHint = getFilenameClassificationHint(file.name);

  // 2. วิเคราะห์พิกเซลโครงสร้างด้วย Canvas 2D + jsQR Engine
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const ratio = height / width;

    const sW = Math.min(width, 400);
    const sH = Math.min(height, Math.floor(height * (sW / width)));

    const offscreen = new OffscreenCanvas(sW, sH);
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, sW, sH);
    const { data } = ctx.getImageData(0, 0, sW, sH);

    // ตรวจหา QR Code ของสลิปธนาคารไทยด้วย jsQR จริง 100%
    let qrCode = jsQR(data, sW, sH, { inversionAttempts: "attemptBoth" });
    let hasRealQr = !!(qrCode && qrCode.data);

    const retryWidth = getQrRetryWidth(width, ratio, hasRealQr);
    if (retryWidth) {
      const retryHeight = Math.floor(height * (retryWidth / width));
      const retryCanvas = new OffscreenCanvas(retryWidth, retryHeight);
      const retryContext = retryCanvas.getContext('2d');
      if (retryContext) {
        retryContext.drawImage(bitmap, 0, 0, retryWidth, retryHeight);
        const retryPixels = retryContext.getImageData(0, 0, retryWidth, retryHeight);
        qrCode = jsQR(retryPixels.data, retryWidth, retryHeight, { inversionAttempts: "attemptBoth" });
        hasRealQr = !!(qrCode && qrCode.data);
      }
    }

    const nativeRetryWidth = getQrNativeRetryWidth(width, height, ratio, hasRealQr);
    if (nativeRetryWidth) {
      const nativeCanvas = new OffscreenCanvas(width, height);
      const nativeContext = nativeCanvas.getContext('2d');
      if (nativeContext) {
        nativeContext.drawImage(bitmap, 0, 0);
        const nativePixels = nativeContext.getImageData(0, 0, width, height);
        qrCode = jsQR(nativePixels.data, width, height, { inversionAttempts: "attemptBoth" });
        hasRealQr = !!(qrCode && qrCode.data);
      }
    }
    bitmap.close();

    const bubbles = detectBubblePattern(data, sW, sH);
    const surroundingChatBubbles = hasRealQr && detectSurroundingChatBubbles(data, sW, sH);

    // ถ้าตรวจพบ QR Code ของสลิปจริง
    const classification = resolveImageClassification({ hasRealQr, ratio, bubbles, surroundingChatBubbles, filenameHint });
    const confidence = classification.type === 'TYPE_CHAT_WITH_SLIP' ? 0.85
      : hasRealQr ? 0.98
        : filenameHint ? 0.55
          : ratio >= 1.25 || bubbles > 4 ? 0.92 : 0.75;
    return { ...classification, confidence };
  } catch {
    const classification = resolveImageClassification({ hasRealQr: false, ratio: 0, bubbles: 0, filenameHint });
    return { ...classification, confidence: filenameHint ? 0.4 : 0.5 };
  }
}
