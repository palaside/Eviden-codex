import * as tesseractEngine from '@/utils/local-slip-ocr';
import {createOcrAdapter, createPendingOcrAdapter} from '@/utils/ocr-adapter-core.mjs';
import {createGeminiOcrAdapter} from '@/utils/gemini-ocr-adapter.mjs';
import {fetchFromGeminiBridge} from '@/utils/gemini-ocr-bridge-client.mjs';
import {fetchFromSelectedOcrBridge} from '@/utils/ocr-provider-bridges.mjs';
import {validateMappedOrNormalizedOutput} from '@/utils/ocr-output-mappers.mjs';
export {createGeminiOcrAdapter};
export type {GeminiImageTransport} from '@/utils/gemini-ocr-adapter.mjs';

/** Keep the existing result types, callbacks and canvas-cache contract intact. */
export interface OcrAdapter {
  readonly id: string;
  extractSlipCandidates: typeof tesseractEngine.extractSlipCandidatesWithLocalOcr;
  readChatPreflight: typeof tesseractEngine.readChatPreflight;
  getCachedChatEvidenceLayers: typeof tesseractEngine.getCachedChatEvidenceLayers;
}

export const localOcrAdapter: OcrAdapter = createOcrAdapter({
  id: 'tesseract-local',
  extractSlipCandidates: tesseractEngine.extractSlipCandidatesWithLocalOcr,
  readChatPreflight: tesseractEngine.readChatPreflight,
  getCachedChatEvidenceLayers: tesseractEngine.getCachedChatEvidenceLayers,
});

// Unconfigured slots remain available for callers that explicitly construct adapters.
export const pendingOcrAdapters: Readonly<Record<string,OcrAdapter>> = Object.freeze({
  'gemini-3.1-pro': createGeminiOcrAdapter(),
  'openthai-2.0': createPendingOcrAdapter('openthai-2.0'),
});

// Step 3: preserve existing upload call sites while routing OCR through the server bridge.
export const geminiOcrAdapter: OcrAdapter = createGeminiOcrAdapter({transcribeImage: fetchFromGeminiBridge, consent: true});
export const selectedOcrAdapter: OcrAdapter = createGeminiOcrAdapter({transcribeImage: fetchFromSelectedOcrBridge, consent: true,id:'selected-ocr',providerLabel:'Selected OCR',validateOutput:validateMappedOrNormalizedOutput});
export const extractSlipCandidatesWithLocalOcr = selectedOcrAdapter.extractSlipCandidates;
export const readChatPreflight = selectedOcrAdapter.readChatPreflight;
export const getCachedChatEvidenceLayers = selectedOcrAdapter.getCachedChatEvidenceLayers;
