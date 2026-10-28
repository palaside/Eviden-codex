import { createWorker, PSM } from "tesseract.js";
import type { LocalSlipCandidate } from "@/utils/local-qr-extractor";
import { findRecipientName, findRecipientNameWithLine, findSenderName, findSlipOcrRegions, toSlipExtraction } from "@/utils/slip-ocr-analysis";
import { filterTextOnlySlipRegionsForJob } from "@/utils/ocr-analysis-policy.mjs";
import { getQrAnchoredOcrCrop, getRecipientRetryCropBounds, type PixelBounds } from "@/utils/qr-anchored-ocr-crop";
import { enhanceOcrPixels, getOcrEnhancementScale } from "@/utils/enhance-for-ocr.mjs";
import { segmentOcrTextLines } from "@/utils/two-layer-segmentation.mjs";
import { createColorSeparatedOcrCanvas, createMorphologicalSlipOcrCanvas, detectChatVisualRegions, findQrSlipObjectBounds } from "@/utils/chat-visual-contours.mjs";
import { createFieldRetryCanvas } from "@/utils/ocr-retry-preprocessing.mjs";
import { findChatEventTimestamp } from "@/utils/chat-capture-metadata.mjs";
import { shouldBuildChatEvidenceLayers } from "@/utils/ocr-analysis-policy.mjs";
import { reconcilePageOcrNamesIntoQrCandidates } from "@/utils/reconcile-slip-ocr-candidates.mjs";
import { buildOcrAttemptTrace, explainSlipOcrRegionRejection } from "@/utils/slip-ocr-trace.mjs";
import type { SlipOcrAttemptTrace, SlipOcrDiagnosticTrace, SlipOcrRegionTrace } from "@/types/slip-ocr-trace";
import {
  evaluateEnhancedOcrRetry,
  selectRecipientRetryResult,
  shouldRetryRecipientName,
  shouldRetryOcrForMissingSlipFields,
  shouldRetryOcrWithEnhancement,
} from "@/utils/ocr-enhancement-retry-policy.mjs";

const OCR_WORKER_COUNT = 2;
const workerPromises: Array<ReturnType<typeof createWorker> | null> = Array.from(
  { length: OCR_WORKER_COUNT },
  () => null,
);
type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

async function recognizeSingleLine(worker: OcrWorker, canvas: HTMLCanvasElement) {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  try {
    return await worker.recognize(canvas, {}, { blocks: true });
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  }
}
type CachedChatEvidenceLayers = ReturnType<typeof segmentOcrTextLines> & {
  warnings: string[];
  maskCoverage: number | null;
  colorMaskCoverage: number | null;
  ocrDiagnosticTrace?: SlipOcrDiagnosticTrace;
};
const chatEvidenceLayerCache = new WeakMap<HTMLCanvasElement, CachedChatEvidenceLayers>();

export function getCachedChatEvidenceLayers(canvas: HTMLCanvasElement) {
  return chatEvidenceLayerCache.get(canvas) || null;
}

export async function readChatPreflight(file: File, workerSlot = 0) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(`อ่านข้อมูลเวลาใน ${file.name} ไม่สำเร็จ`);
    context.drawImage(bitmap, 0, 0);
    const worker = await getLocalOcrWorker(workerSlot);
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const lines = getOcrLines(data).map((line) => ({
      text: line.text,
      confidence: Math.max(0, Math.min(1, line.confidence / 100)),
      bounds: {
        x: line.bbox.x0,
        y: line.bbox.y0,
        width: line.bbox.x1 - line.bbox.x0,
        height: line.bbox.y1 - line.bbox.y0,
      },
    }));
    return { lines, eventTime: findChatEventTimestamp(lines) };
  } finally {
    bitmap.close();
  }
}

function getLocalOcrWorker(slot: number) {
  const workerIndex = ((Math.floor(slot) % OCR_WORKER_COUNT) + OCR_WORKER_COUNT) % OCR_WORKER_COUNT;
  workerPromises[workerIndex] ??= createWorker("tha+eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    workerBlobURL: false,
    gzip: false,
    cacheMethod: "none",
  });
  return workerPromises[workerIndex]!;
}

function makeCanvasCrop(source: HTMLCanvasElement, bounds: PixelBounds): HTMLCanvasElement {
  const crop = document.createElement("canvas");
  crop.width = bounds.width;
  crop.height = bounds.height;
  crop.getContext("2d")?.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  return crop;
}

function makeEnhancedOcrCrop(
  source: HTMLCanvasElement,
  bounds: PixelBounds,
  maxScale = 2.5,
  maxDimension = 1800,
): { canvas: HTMLCanvasElement; scale: number } {
  const crop = makeCanvasCrop(source, bounds);
  const scale = getOcrEnhancementScale(crop.width, crop.height, maxScale, maxDimension);
  const enlarged = document.createElement("canvas");
  enlarged.width = Math.max(1, Math.round(crop.width * scale));
  enlarged.height = Math.max(1, Math.round(crop.height * scale));
  const context = enlarged.getContext("2d");
  if (context) {
    context.drawImage(crop, 0, 0, enlarged.width, enlarged.height);
    const image = context.getImageData(0, 0, enlarged.width, enlarged.height);
    image.data.set(enhanceOcrPixels(image.data, enlarged.width, enlarged.height).pixels);
    context.putImageData(image, 0, 0);
  }
  return { canvas: enlarged, scale };
}

function getOcrLines(data: Awaited<ReturnType<Awaited<ReturnType<typeof createWorker>>["recognize"]>>["data"]) {
  return data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? [];
}

function getSlipRegionsForOcrLines(
  lines: ReturnType<typeof getOcrLines>,
  dimensions: { width: number; height: number },
  qrAnchor?: { x: number; y: number },
  contourBoundary = false,
) {
  return findSlipOcrRegions(
    lines.map((line) => ({ text: line.text, confidence: line.confidence, bbox: line.bbox })),
    dimensions,
    qrAnchor ? { includeRecipientSearchBand: true, qrAnchor, contourBoundary } : undefined,
  );
}

function syncTraceWithCandidate(
  trace: SlipOcrDiagnosticTrace,
  candidate: LocalSlipCandidate,
): SlipOcrDiagnosticTrace {
  const candidateBounds = candidate.bounds;
  const regionIndex = trace.regions.findIndex((region) => {
    const overlapWidth = Math.max(0, Math.min(
      candidateBounds.x + candidateBounds.width,
      region.bounds.x + region.bounds.width,
    ) - Math.max(candidateBounds.x, region.bounds.x));
    const overlapHeight = Math.max(0, Math.min(
      candidateBounds.y + candidateBounds.height,
      region.bounds.y + region.bounds.height,
    ) - Math.max(candidateBounds.y, region.bounds.y));
    const overlap = overlapWidth * overlapHeight;
    const smaller = Math.min(
      candidateBounds.width * candidateBounds.height,
      region.bounds.width * region.bounds.height,
    );
    return smaller > 0 && overlap / smaller >= 0.5;
  });
  if (regionIndex < 0) return trace;

  const data = candidate.data;
  return {
    ...trace,
    regions: trace.regions.map((region, index) => index === regionIndex
      ? {
          ...region,
          amount: region.amount ?? data.transaction.amount,
          senderName: region.senderName || data.sender.name,
          receiverName: region.receiverName || data.receiver.name,
          reference: region.reference || data.transaction.reference_no,
        }
      : region),
  };
}

export async function extractSlipCandidatesWithLocalOcr(
  canvas: HTMLCanvasElement,
  qrCandidates: Pick<LocalSlipCandidate, "bounds">[] = [],
  workerSlot = 0,
  options: {
    jobKind: "CHAT" | "SLIP";
    onRetryDiagnostic?: (message: string) => void;
  },
): Promise<LocalSlipCandidate[]> {
  try {
    const worker = await getLocalOcrWorker(workerSlot);
    let qrOcrCandidates: LocalSlipCandidate[] = [];
    const diagnosticAttempts: SlipOcrAttemptTrace[] = [];
    let fieldRetryAttempted = false;
    let contourCandidates: Awaited<ReturnType<typeof detectChatVisualRegions>>["regions"] = [];
    if (qrCandidates.length) {
      try {
        contourCandidates = (await detectChatVisualRegions(canvas, [])).regions;
      } catch {
        contourCandidates = [];
      }
    }

    // A detected QR is a local anchor for the slip, so avoid recognizing the entire chat page first.
    for (const qrCandidate of qrCandidates) {
      const objectBounds = findQrSlipObjectBounds(contourCandidates, qrCandidate.bounds, {
        width: canvas.width,
        height: canvas.height,
      });
      const fallbackBounds = getQrAnchoredOcrCrop({ width: canvas.width, height: canvas.height }, qrCandidate.bounds);
      const paddingX = objectBounds ? Math.round(objectBounds.width * 0.015) : 0;
      const paddingY = objectBounds ? Math.round(objectBounds.height * 0.015) : 0;
      const cropBounds = objectBounds ? {
        x: Math.max(0, objectBounds.x - paddingX),
        y: Math.max(0, objectBounds.y - paddingY),
        width: Math.min(canvas.width, objectBounds.x + objectBounds.width + paddingX)
          - Math.max(0, objectBounds.x - paddingX),
        height: Math.min(canvas.height, objectBounds.y + objectBounds.height + paddingY)
          - Math.max(0, objectBounds.y - paddingY),
      } : fallbackBounds;
      const qrCrop = makeCanvasCrop(canvas, cropBounds);
      const { data: originalQrData } = await worker.recognize(qrCrop, {}, { blocks: true });
      let lines = getOcrLines(originalQrData);
      diagnosticAttempts.push(buildOcrAttemptTrace({
        id: `qr-${diagnosticAttempts.length + 1}-original`, scope: "qr_crop", trigger: "initial",
        sourceBounds: cropBounds, inputWidth: qrCrop.width, inputHeight: qrCrop.height, scale: 1,
        meanConfidence: originalQrData.confidence, lines,
      }));
      const qrAnchor = {
        x: qrCandidate.bounds.x + qrCandidate.bounds.width / 2 - cropBounds.x,
        y: qrCandidate.bounds.y + qrCandidate.bounds.height / 2 - cropBounds.y,
      };
      const originalQrRegions = getSlipRegionsForOcrLines(lines, { width: qrCrop.width, height: qrCrop.height }, qrAnchor, !!objectBounds);
      const retryQrForFields = shouldRetryOcrForMissingSlipFields(originalQrRegions, fieldRetryAttempted, true);
      if (shouldRetryOcrWithEnhancement(originalQrData.confidence, lines.length) || retryQrForFields) {
        if (retryQrForFields) fieldRetryAttempted = true;
        const retry = makeEnhancedOcrCrop(
          qrCrop,
          { x: 0, y: 0, width: qrCrop.width, height: qrCrop.height },
          1.5,
          2800,
        );
        const retryCanvas = retryQrForFields
          ? (await createFieldRetryCanvas(retry.canvas, options.jobKind, {
              morphology: createMorphologicalSlipOcrCanvas,
              colorSeparation: createColorSeparatedOcrCanvas,
            })).canvas
          : retry.canvas;
        const { data: enhancedQrData } = await worker.recognize(retryCanvas, {}, { blocks: true });
        diagnosticAttempts.push(buildOcrAttemptTrace({
          id: `qr-${diagnosticAttempts.length + 1}-retry`, scope: "qr_crop",
          trigger: retryQrForFields ? "missing_fields" : "low_confidence", sourceBounds: cropBounds,
          inputWidth: retryCanvas.width, inputHeight: retryCanvas.height, scale: retry.scale,
          meanConfidence: enhancedQrData.confidence, lines: getOcrLines(enhancedQrData),
        }));
        const enhancedLines = getOcrLines(enhancedQrData).map((line) => ({
          ...line,
          bbox: {
            x0: Math.round(line.bbox.x0 / retry.scale),
            y0: Math.round(line.bbox.y0 / retry.scale),
            x1: Math.round(line.bbox.x1 / retry.scale),
            y1: Math.round(line.bbox.y1 / retry.scale),
          },
        }));
        const enhancedQrRegions = getSlipRegionsForOcrLines(
          enhancedLines,
          { width: qrCrop.width, height: qrCrop.height },
          qrAnchor,
          !!objectBounds,
        );
        const decision = evaluateEnhancedOcrRetry({
          scope: "QR crop",
          trigger: retryQrForFields ? "missing-fields" : "low-confidence",
          originalRegions: originalQrRegions,
          enhancedRegions: enhancedQrRegions,
          originalConfidence: originalQrData.confidence,
          enhancedConfidence: enhancedQrData.confidence,
          enhancedLineCount: enhancedLines.length,
        });
        options.onRetryDiagnostic?.(decision.diagnostic);
        if (decision.accepted) {
          lines = enhancedLines;
        }
      }
      const normalizedLines = lines.map((line) => ({
        text: line.text,
        confidence: line.confidence,
        bbox: line.bbox,
      }));
      const regions = findSlipOcrRegions(normalizedLines, { width: qrCrop.width, height: qrCrop.height }, {
        includeRecipientSearchBand: true,
        qrAnchor: {
          x: qrCandidate.bounds.x + qrCandidate.bounds.width / 2 - cropBounds.x,
          y: qrCandidate.bounds.y + qrCandidate.bounds.height / 2 - cropBounds.y,
        },
        contourBoundary: !!objectBounds,
      });

      for (const region of regions) {
        if (!region.senderName) {
          const senderRetry = makeEnhancedOcrCrop(qrCrop, {
            x: Math.max(0, region.bounds.x0),
            y: Math.max(0, region.bounds.y0),
            width: Math.max(1, region.bounds.x1 - region.bounds.x0),
            height: Math.max(1, region.bounds.y1 - region.bounds.y0),
          }, 1.5, 2800);
          const senderRetryCanvas = (await createFieldRetryCanvas(senderRetry.canvas, options.jobKind, {
            morphology: createMorphologicalSlipOcrCanvas,
            colorSeparation: createColorSeparatedOcrCanvas,
          })).canvas;
          const { data: senderRetryData } = await worker.recognize(senderRetryCanvas, {}, { blocks: true });
          const senderRetryLines = getOcrLines(senderRetryData);
          diagnosticAttempts.push(buildOcrAttemptTrace({
            id: `sender-${diagnosticAttempts.length + 1}`, scope: "recipient_retry", trigger: "sender_missing",
            sourceBounds: { x: cropBounds.x + region.bounds.x0, y: cropBounds.y + region.bounds.y0, width: region.bounds.x1 - region.bounds.x0, height: region.bounds.y1 - region.bounds.y0 },
            inputWidth: senderRetryCanvas.width, inputHeight: senderRetryCanvas.height, scale: senderRetry.scale,
            meanConfidence: senderRetryData.confidence, lines: senderRetryLines,
          }));
          const retrySender = findSenderName(senderRetryLines.map((line) => ({
            text: line.text,
            confidence: line.confidence,
            bbox: line.bbox,
          })), senderRetry.scale);
          if (retrySender.name) {
            region.senderName = retrySender.name;
            region.senderNameConfidence = retrySender.confidence;
          }
        }
        if (shouldRetryRecipientName(region.receiverName, region.receiverNameConfidence)) {
          const retryBounds = getRecipientRetryCropBounds(region);
          const x0 = Math.max(0, Math.floor(retryBounds.x));
          const y0 = Math.max(0, Math.floor(retryBounds.y));
          const x1 = Math.min(qrCrop.width, Math.ceil(retryBounds.x + retryBounds.width));
          const y1 = Math.min(qrCrop.height, Math.ceil(retryBounds.y + retryBounds.height));
          const retry = makeEnhancedOcrCrop(qrCrop, {
            x: x0,
            y: y0,
            width: Math.max(1, x1 - x0),
            height: Math.max(1, y1 - y0),
          });
          const retryCanvas = (await createFieldRetryCanvas(retry.canvas, options.jobKind, {
            morphology: createMorphologicalSlipOcrCanvas,
            colorSeparation: createColorSeparatedOcrCanvas,
          })).canvas;
          const { data: retryData } = await worker.recognize(retryCanvas, {}, { blocks: true });
          diagnosticAttempts.push(buildOcrAttemptTrace({
            id: `recipient-${diagnosticAttempts.length + 1}`, scope: "recipient_retry", trigger: "recipient_missing",
            sourceBounds: { x: cropBounds.x + x0, y: cropBounds.y + y0, width: x1 - x0, height: y1 - y0 },
            inputWidth: retry.canvas.width, inputHeight: retry.canvas.height, scale: retry.scale,
            meanConfidence: retryData.confidence, lines: getOcrLines(retryData),
          }));
          const retryRecipient = findRecipientName(
            getOcrLines(retryData).map((line) => ({
              text: line.text,
              confidence: line.confidence,
              bbox: line.bbox,
            })),
            retry.scale,
          );
          const selectedRecipient = selectRecipientRetryResult(
            region.receiverName,
            region.receiverNameConfidence,
            retryRecipient.name,
            retryRecipient.confidence,
          );
          region.receiverNameRetryConflict = selectedRecipient.conflict;
          region.receiverName = selectedRecipient.name;
          region.receiverNameConfidence = selectedRecipient.confidence;

          // Run one bounded color-separation variant for low-confidence names.
          // Keep the existing policy as the selector; this adds evidence without
          // turning an ambiguous OCR result into a confirmed value.
          const colorRetryCanvas = await createColorSeparatedOcrCanvas(retry.canvas);
          const { data: colorRetryData } = await recognizeSingleLine(worker, colorRetryCanvas);
          const colorRetryLines = getOcrLines(colorRetryData);
          diagnosticAttempts.push(buildOcrAttemptTrace({
            id: `recipient-${diagnosticAttempts.length + 1}-color`, scope: "recipient_retry", trigger: "recipient_missing",
            sourceBounds: { x: cropBounds.x + x0, y: cropBounds.y + y0, width: x1 - x0, height: y1 - y0 },
            inputWidth: colorRetryCanvas.width, inputHeight: colorRetryCanvas.height, scale: retry.scale,
            meanConfidence: colorRetryData.confidence, lines: colorRetryLines,
          }));
          const colorRecipient = findRecipientName(
            colorRetryLines.map((line) => ({ text: line.text, confidence: line.confidence, bbox: line.bbox })),
            retry.scale,
          );
          const selectedColorRecipient = selectRecipientRetryResult(
            region.receiverName,
            region.receiverNameConfidence,
            colorRecipient.name,
            colorRecipient.confidence,
          );
          region.receiverNameRetryConflict = region.receiverNameRetryConflict || selectedColorRecipient.conflict;
          region.receiverName = selectedColorRecipient.name;
          region.receiverNameConfidence = selectedColorRecipient.confidence;
        }

        const absoluteBounds = {
          x: cropBounds.x + region.bounds.x0,
          y: cropBounds.y + region.bounds.y0,
          width: region.bounds.x1 - region.bounds.x0,
          height: region.bounds.y1 - region.bounds.y0,
        };
        const evidenceBounds = {
          x: Math.min(absoluteBounds.x, qrCandidate.bounds.x),
          y: Math.min(absoluteBounds.y, qrCandidate.bounds.y),
          width: Math.max(absoluteBounds.x + absoluteBounds.width, qrCandidate.bounds.x + qrCandidate.bounds.width)
            - Math.min(absoluteBounds.x, qrCandidate.bounds.x),
          height: Math.max(absoluteBounds.y + absoluteBounds.height, qrCandidate.bounds.y + qrCandidate.bounds.height)
            - Math.min(absoluteBounds.y, qrCandidate.bounds.y),
        };
        const evidenceCrop = makeCanvasCrop(canvas, evidenceBounds);
        const candidateData = toSlipExtraction(region);
        qrOcrCandidates.push({
          data: candidateData,
          bounds: evidenceBounds,
          cropDataUrl: evidenceCrop.toDataURL("image/png"),
          ocrTextBoxes: region.ocrLineEvidence.map((entry) => ({
            ...entry,
            bounds: { ...entry.bounds, x: entry.bounds.x + cropBounds.x, y: entry.bounds.y + cropBounds.y },
          })),
        });
      }
    }

    // Always OCR the entire page as well: other slips may exist outside detected QR crops.
    const { data: originalData } = await worker.recognize(canvas, {}, { blocks: true });
    let lines = getOcrLines(originalData);
    diagnosticAttempts.push(buildOcrAttemptTrace({
      id: "full-page-original", scope: "full_page", trigger: "initial",
      sourceBounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      inputWidth: canvas.width, inputHeight: canvas.height, scale: 1,
      meanConfidence: originalData.confidence, lines,
    }));
    const originalPageRegions = getSlipRegionsForOcrLines(lines, { width: canvas.width, height: canvas.height });
    const retryPageForFields = shouldRetryOcrForMissingSlipFields(originalPageRegions, fieldRetryAttempted);
    if (shouldRetryOcrWithEnhancement(originalData.confidence, lines.length) || retryPageForFields) {
      if (retryPageForFields) fieldRetryAttempted = true;
      const retry = makeEnhancedOcrCrop(
        canvas,
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        1.5,
        2800,
      );
      const retryCanvas = retryPageForFields
        ? (await createFieldRetryCanvas(retry.canvas, options.jobKind, {
            morphology: createMorphologicalSlipOcrCanvas,
            colorSeparation: createColorSeparatedOcrCanvas,
          })).canvas
        : retry.canvas;
      const { data: enhancedData } = await worker.recognize(retryCanvas, {}, { blocks: true });
      diagnosticAttempts.push(buildOcrAttemptTrace({
        id: "full-page-retry", scope: "full_page",
        trigger: retryPageForFields ? "missing_fields" : "low_confidence",
        sourceBounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
        inputWidth: retryCanvas.width, inputHeight: retryCanvas.height, scale: retry.scale,
        meanConfidence: enhancedData.confidence, lines: getOcrLines(enhancedData),
      }));
      const enhancedLines = getOcrLines(enhancedData).map((line) => ({
        ...line,
        bbox: {
          x0: Math.round(line.bbox.x0 / retry.scale),
          y0: Math.round(line.bbox.y0 / retry.scale),
          x1: Math.round(line.bbox.x1 / retry.scale),
          y1: Math.round(line.bbox.y1 / retry.scale),
        },
      }));
      const enhancedPageRegions = getSlipRegionsForOcrLines(
        enhancedLines,
        { width: canvas.width, height: canvas.height },
      );
      const decision = evaluateEnhancedOcrRetry({
        scope: "full page",
        trigger: retryPageForFields ? "missing-fields" : "low-confidence",
        originalRegions: originalPageRegions,
        enhancedRegions: enhancedPageRegions,
        originalConfidence: originalData.confidence,
        enhancedConfidence: enhancedData.confidence,
        enhancedLineCount: enhancedLines.length,
      });
      options.onRetryDiagnostic?.(decision.diagnostic);
      if (decision.accepted) {
        lines = enhancedLines;
      }
    }
    let visualCandidates: Awaited<ReturnType<typeof detectChatVisualRegions>>["regions"] = [];
    let contourAudit: Awaited<ReturnType<typeof detectChatVisualRegions>>["contourAudit"] | null = null;
    let maskPreviews: Awaited<ReturnType<typeof detectChatVisualRegions>>["maskPreviews"] = null;
    if (shouldBuildChatEvidenceLayers(options.jobKind)) {
      const chatOcrLines = lines.map((line, index) => ({
      index,
      text: line.text,
      confidence: line.confidence / 100,
      bounds: {
        x: line.bbox.x0,
        y: line.bbox.y0,
        width: line.bbox.x1 - line.bbox.x0,
        height: line.bbox.y1 - line.bbox.y0,
      },
      words: line.words?.map((word) => ({
        text: word.text,
        confidence: word.confidence / 100,
        bounds: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        },
        symbols: word.symbols?.map((symbol) => ({
          text: symbol.text,
          confidence: symbol.confidence / 100,
          bounds: {
            x: symbol.bbox.x0,
            y: symbol.bbox.y0,
            width: symbol.bbox.x1 - symbol.bbox.x0,
            height: symbol.bbox.y1 - symbol.bbox.y0,
          },
        })),
      })),
      }));
      const segmentationWarnings: string[] = [];
      let maskCoverage: number | null = null;
      let colorMaskCoverage: number | null = null;
      try {
        const visualSegmentation = await detectChatVisualRegions(canvas, chatOcrLines);
        visualCandidates = visualSegmentation.regions;
        contourAudit = visualSegmentation.contourAudit;
        maskPreviews = visualSegmentation.maskPreviews;
        maskCoverage = visualSegmentation.maskCoverage;
        colorMaskCoverage = visualSegmentation.colorMaskCoverage;
        segmentationWarnings.push(visualSegmentation.warning);
      } catch {
        segmentationWarnings.push("OpenCV foreground mask/contour detection was unavailable; only OCR-derived regions are shown.");
      }
      chatEvidenceLayerCache.set(canvas, {
        ...segmentOcrTextLines(chatOcrLines, { width: canvas.width, height: canvas.height }, visualCandidates),
        warnings: segmentationWarnings,
        maskCoverage,
        colorMaskCoverage,
      });
    }
    const detectedSlipRegions = findSlipOcrRegions(
      lines.map((line) => ({ text: line.text, confidence: line.confidence, bbox: line.bbox })),
      { width: canvas.width, height: canvas.height },
    );
    const regions = filterTextOnlySlipRegionsForJob(detectedSlipRegions, {
      jobKind: options.jobKind,
      visualCandidates,
      qrCandidates,
    });
    for (const region of regions) {
      if (!region.senderName) {
        const senderRetryBounds = region.bounds;
        const senderRetry = makeEnhancedOcrCrop(canvas, {
          x: senderRetryBounds.x0,
          y: senderRetryBounds.y0,
          width: Math.max(1, senderRetryBounds.x1 - senderRetryBounds.x0),
          height: Math.max(1, senderRetryBounds.y1 - senderRetryBounds.y0),
        }, 1.5, 2800);
        const senderRetryCanvas = (await createFieldRetryCanvas(senderRetry.canvas, options.jobKind, {
          morphology: createMorphologicalSlipOcrCanvas,
          colorSeparation: createColorSeparatedOcrCanvas,
        })).canvas;
        const { data: senderRetryData } = await worker.recognize(senderRetryCanvas, {}, { blocks: true });
        const senderRetryLines = getOcrLines(senderRetryData);
        diagnosticAttempts.push(buildOcrAttemptTrace({
          id: `page-sender-${diagnosticAttempts.length + 1}`, scope: "recipient_retry", trigger: "sender_missing",
          sourceBounds: { x: senderRetryBounds.x0, y: senderRetryBounds.y0, width: senderRetryBounds.x1 - senderRetryBounds.x0, height: senderRetryBounds.y1 - senderRetryBounds.y0 },
          inputWidth: senderRetryCanvas.width, inputHeight: senderRetryCanvas.height, scale: senderRetry.scale,
          meanConfidence: senderRetryData.confidence, lines: senderRetryLines,
        }));
        const retrySender = findSenderName(senderRetryLines.map((line) => ({
          text: line.text,
          confidence: line.confidence,
          bbox: line.bbox,
        })), senderRetry.scale);
        if (retrySender.name) {
          region.senderName = retrySender.name;
          region.senderNameConfidence = retrySender.confidence;
        }
      }
      if (!shouldRetryRecipientName(region.receiverName, region.receiverNameConfidence)) continue;

      const matchedQrs = qrCandidates.filter(({ bounds }) => {
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        return centerX >= region.bounds.x0 && centerX <= region.bounds.x1
          && centerY >= region.bounds.y0 && centerY <= region.bounds.y1;
      });
      const qrBounds = matchedQrs.length === 1 ? matchedQrs[0].bounds : null;
      const focus = region.recipientFocusBounds ?? (qrBounds
        ? {
            x0: qrBounds.x - Math.max(qrBounds.width * 3, canvas.width * 0.48),
            y0: qrBounds.y - Math.max(qrBounds.height * 4, canvas.height * 0.3),
            x1: qrBounds.x + qrBounds.width + Math.max(qrBounds.width * 3, canvas.width * 0.48),
            y1: qrBounds.y + qrBounds.height + Math.max(qrBounds.height * 4, canvas.height * 0.3),
          }
        : region.focusBounds);
      const x0 = Math.max(0, Math.floor(focus.x0));
      const y0 = Math.max(0, Math.floor(focus.y0));
      const x1 = Math.min(canvas.width, Math.ceil(focus.x1));
      const y1 = Math.min(canvas.height, Math.ceil(focus.y1));
      const width = Math.max(1, x1 - x0);
      const height = Math.max(1, y1 - y0);
      const scale = getOcrEnhancementScale(width, height, 3);
      if (scale <= 1) continue;
      const retry = makeEnhancedOcrCrop(canvas, { x: x0, y: y0, width, height });
      const retryCanvas = (await createFieldRetryCanvas(retry.canvas, options.jobKind, {
        morphology: createMorphologicalSlipOcrCanvas,
        colorSeparation: createColorSeparatedOcrCanvas,
      })).canvas;
      const { data: cropData } = await worker.recognize(retryCanvas, {}, { blocks: true });
      const cropLines = cropData.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? [];
      diagnosticAttempts.push(buildOcrAttemptTrace({
        id: `page-recipient-${diagnosticAttempts.length + 1}`, scope: "recipient_retry", trigger: "recipient_missing",
        sourceBounds: { x: x0, y: y0, width, height }, inputWidth: retry.canvas.width, inputHeight: retry.canvas.height,
        scale: retry.scale, meanConfidence: cropData.confidence, lines: cropLines,
      }));
      const recipient = findRecipientNameWithLine(
        cropLines.map((line) => ({ text: line.text, confidence: line.confidence, bbox: line.bbox })),
        retry.scale,
      );
      let lineRecipient = { name: null as string | null, confidence: 0 };
      if (recipient.nameLine) {
        const line = recipient.nameLine;
        const padding = Math.max(12, Math.round(18 * retry.scale));
        const lineBounds = {
          x: Math.max(0, Math.floor(line.bbox.x0 - padding)),
          y: Math.max(0, Math.floor(line.bbox.y0 - padding)),
          width: Math.min(retryCanvas.width, Math.ceil(line.bbox.x1 + padding)) - Math.max(0, Math.floor(line.bbox.x0 - padding)),
          height: Math.min(retryCanvas.height, Math.ceil(line.bbox.y1 + padding)) - Math.max(0, Math.floor(line.bbox.y0 - padding)),
        };
        const lineCanvas = makeCanvasCrop(retryCanvas, lineBounds);
        const { data: lineData } = await recognizeSingleLine(worker, lineCanvas);
        const lineOcrLines = getOcrLines(lineData);
        diagnosticAttempts.push(buildOcrAttemptTrace({
          id: `page-recipient-${diagnosticAttempts.length + 1}-line`, scope: "recipient_retry", trigger: "recipient_missing",
          sourceBounds: { x: x0 + lineBounds.x, y: y0 + lineBounds.y, width: lineBounds.width, height: lineBounds.height },
          inputWidth: lineCanvas.width, inputHeight: lineCanvas.height, scale: retry.scale,
          meanConfidence: lineData.confidence, lines: lineOcrLines,
        }));
        const syntheticLabel = {
          text: "ไปยัง",
          confidence: 100,
          bbox: { x0: 0, y0: 0, x1: Math.max(1, lineCanvas.width / 20), y1: 1 },
        };
        lineRecipient = findRecipientName([
          syntheticLabel,
          ...lineOcrLines.map((candidate) => ({ text: candidate.text, confidence: candidate.confidence, bbox: {
            x0: candidate.bbox.x0,
            y0: Math.max(2, candidate.bbox.y0),
            x1: candidate.bbox.x1,
            y1: Math.max(3, candidate.bbox.y1),
          } })),
        ], retry.scale);
      }
      const selectedRecipient = selectRecipientRetryResult(
        region.receiverName,
        region.receiverNameConfidence,
        lineRecipient.name || recipient.name,
        lineRecipient.name ? lineRecipient.confidence : recipient.confidence,
      );
      region.receiverNameRetryConflict = selectedRecipient.conflict;
      region.receiverName = selectedRecipient.name;
      region.receiverNameConfidence = selectedRecipient.confidence;

      const colorRetryCanvas = await createColorSeparatedOcrCanvas(retry.canvas);
      const { data: colorRetryData } = await recognizeSingleLine(worker, colorRetryCanvas);
      const colorRetryLines = colorRetryData.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? [];
      diagnosticAttempts.push(buildOcrAttemptTrace({
        id: `page-recipient-${diagnosticAttempts.length + 1}-color`, scope: "recipient_retry", trigger: "recipient_missing",
        sourceBounds: { x: x0, y: y0, width, height }, inputWidth: colorRetryCanvas.width, inputHeight: colorRetryCanvas.height,
        scale: retry.scale, meanConfidence: colorRetryData.confidence, lines: colorRetryLines,
      }));
      const colorRecipient = findRecipientName(
        colorRetryLines.map((line) => ({ text: line.text, confidence: line.confidence, bbox: line.bbox })),
        retry.scale,
      );
      const selectedColorRecipient = selectRecipientRetryResult(
        region.receiverName,
        region.receiverNameConfidence,
        colorRecipient.name,
        colorRecipient.confidence,
      );
      region.receiverNameRetryConflict = region.receiverNameRetryConflict || selectedColorRecipient.conflict;
      region.receiverName = selectedColorRecipient.name;
      region.receiverNameConfidence = selectedColorRecipient.confidence;
    }

    // Build the trace after all field retries so exported evidence and the UI
    // describe the same candidate state.
    const diagnosticRegions: SlipOcrRegionTrace[] = detectedSlipRegions.map((region) => {
      const acceptedByCandidatePolicy = regions.includes(region);
      return {
        bounds: { x: region.bounds.x0, y: region.bounds.y0, width: region.bounds.x1 - region.bounds.x0, height: region.bounds.y1 - region.bounds.y0 },
        amount: region.amount,
        senderName: region.senderName,
        receiverName: region.receiverName,
        reference: region.referenceNo,
        acceptedByCandidatePolicy,
        reason: acceptedByCandidatePolicy ? "ผ่าน policy filter สำหรับ candidate OCR" : "parser พบ region แต่ policy filter ไม่ส่งต่อเป็น candidate; policy ปัจจุบันไม่ส่งเหตุผลราย region",
      };
    });
    const ocrDiagnosticTrace: SlipOcrDiagnosticTrace = {
      sourceDimensions: { width: canvas.width, height: canvas.height },
      objectBounds: visualCandidates.map(({ bounds }) => ({ ...bounds })),
      qrBounds: qrCandidates.map(({ bounds }) => ({ ...bounds })),
      contourAudit: contourAudit ?? undefined,
      maskPreviews,
      attempts: diagnosticAttempts,
      regions: diagnosticRegions,
      parserRejectionReasons: explainSlipOcrRegionRejection({
        lines: diagnosticAttempts.filter((attempt) => attempt.scope === "full_page").at(-1)?.lines || [],
        qrCount: qrCandidates.length,
        regionCount: diagnosticRegions.length,
      }),
    };
    const cachedLayers = chatEvidenceLayerCache.get(canvas);
    if (cachedLayers) chatEvidenceLayerCache.set(canvas, { ...cachedLayers, ocrDiagnosticTrace });

    const pageOcrCandidates = regions.map((region) => {
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, region.bounds.x1 - region.bounds.x0);
    crop.height = Math.max(1, region.bounds.y1 - region.bounds.y0);
    crop.getContext("2d")?.drawImage(
      canvas,
      region.bounds.x0,
      region.bounds.y0,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );

    const data = toSlipExtraction(region);

    return {
      data,
      bounds: {
        x: region.bounds.x0,
        y: region.bounds.y0,
        width: crop.width,
        height: crop.height,
      },
      cropDataUrl: crop.toDataURL("image/png"),
      ocrTextBoxes: region.ocrLineEvidence,
      ocrDiagnosticTrace,
    };
    });

    qrOcrCandidates = reconcilePageOcrNamesIntoQrCandidates(qrOcrCandidates, pageOcrCandidates);

    const uncoveredPageCandidates = pageOcrCandidates.filter((pageCandidate) =>
      !qrOcrCandidates.some((qrCandidate) => {
        const overlapWidth = Math.max(0, Math.min(
          pageCandidate.bounds.x + pageCandidate.bounds.width,
          qrCandidate.bounds.x + qrCandidate.bounds.width,
        ) - Math.max(pageCandidate.bounds.x, qrCandidate.bounds.x));
        const overlapHeight = Math.max(0, Math.min(
          pageCandidate.bounds.y + pageCandidate.bounds.height,
          qrCandidate.bounds.y + qrCandidate.bounds.height,
        ) - Math.max(pageCandidate.bounds.y, qrCandidate.bounds.y));
        const overlapArea = overlapWidth * overlapHeight;
        const smallerArea = Math.min(
          pageCandidate.bounds.width * pageCandidate.bounds.height,
          qrCandidate.bounds.width * qrCandidate.bounds.height,
        );
        return smallerArea > 0 && overlapArea / smallerArea >= 0.5;
      }),
    );

    return [...qrOcrCandidates, ...uncoveredPageCandidates].map((candidate) => ({
      ...candidate,
      ocrDiagnosticTrace: syncTraceWithCandidate(ocrDiagnosticTrace, candidate),
    }));
  } catch (error) {
    const workerIndex = ((Math.floor(workerSlot) % OCR_WORKER_COUNT) + OCR_WORKER_COUNT) % OCR_WORKER_COUNT;
    workerPromises[workerIndex] = null;
    throw error;
  }
}
