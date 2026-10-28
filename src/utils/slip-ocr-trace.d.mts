import type { SlipOcrAttemptTrace, SlipOcrTraceScope, SlipOcrTraceTrigger, SlipOcrTraceBounds } from "../types/slip-ocr-trace";

export function buildOcrAttemptTrace(input: {
  id: string;
  scope: SlipOcrTraceScope;
  trigger: SlipOcrTraceTrigger;
  sourceBounds: SlipOcrTraceBounds;
  inputWidth: number;
  inputHeight: number;
  scale: number;
  meanConfidence: number;
  lines: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
}): SlipOcrAttemptTrace;

export function explainSlipOcrRegionRejection(input: {
  lines: Array<{ text: string }>;
  qrCount: number;
  regionCount: number;
}): string[];
