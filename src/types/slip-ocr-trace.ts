export type SlipOcrTraceScope = "qr_crop" | "full_page" | "recipient_retry";
export type SlipOcrTraceTrigger = "initial" | "low_confidence" | "missing_fields" | "recipient_missing" | "sender_missing" | "visual_region_fallback";

export interface SlipOcrTraceBounds { x: number; y: number; width: number; height: number }

export interface SlipOcrTraceLine {
  id: string;
  text: string;
  confidence: number;
  bounds: SlipOcrTraceBounds;
}

export interface SlipImageArtifact {
  id: string;
  kind: "source" | "ocr_variant" | "segmentation_mask";
  variant: string;
  width: number;
  height: number;
  scale: number;
  sha256: string;
  sourceBounds?: SlipOcrTraceBounds;
  stages: string[];
  dataUrl?: string;
}

export interface SlipOcrAttemptTrace {
  id: string;
  scope: SlipOcrTraceScope;
  trigger: SlipOcrTraceTrigger;
  sourceBounds: SlipOcrTraceBounds;
  inputDimensions: { width: number; height: number };
  scale: number;
  meanConfidence: number;
  lines: SlipOcrTraceLine[];
}

export interface SlipOcrRegionTrace {
  bounds: SlipOcrTraceBounds;
  amount: number | null;
  senderName: string | null;
  receiverName: string | null;
  reference: string | null;
  visualCropEvidence?: boolean;
  acceptedByCandidatePolicy: boolean;
  reason: string;
}

export interface SlipOcrContourSample {
  bounds: SlipOcrTraceBounds;
  contourArea: number;
  pageAreaRatio: number;
  relatedLineIndex: number | null;
  reason: string;
  detectionMethod: string;
}

export interface SlipOcrContourMaskAudit {
  totalContours: number;
  keptCount: number;
  rejectedByReason: Record<string, number>;
  rejectedSamples: SlipOcrContourSample[];
}

export interface SlipOcrContourAudit {
  grayscale: SlipOcrContourMaskAudit;
  color: SlipOcrContourMaskAudit;
  mergedColorCount: number;
  colorOnlyCount: number;
  finalCandidateCount: number;
  morphologyKernel: { width: number; height: number };
  adaptiveThresholdBlockSize: number;
}

export interface SlipOcrDiagnosticTrace {
  schemaVersion?: "digital-evidence.slip-ocr-trace.v2";
  sourceDimensions: { width: number; height: number };
  objectBounds: SlipOcrTraceBounds[];
  qrBounds: SlipOcrTraceBounds[];
  contourAudit?: SlipOcrContourAudit;
  maskPreviews?: { grayscale: string | null; color: string | null } | null;
  attempts: SlipOcrAttemptTrace[];
  regions: SlipOcrRegionTrace[];
  parserRejectionReasons: string[];
  imageArtifacts?: SlipImageArtifact[];
}
