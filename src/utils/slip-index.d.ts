import type { SlipExtraction } from "@/schemas/slip.schema";

export type SlipIndexRecord = {
  id: string;
  sourceItemId?: string;
  source: string;
  sha256: string;
  data: SlipExtraction;
  isConfirmed: boolean;
  chatPage: string;
  dossierPage: number | null;
  bounds?: { x: number; y: number; width: number; height: number };
  needsReview: boolean;
};

export function filterSlipRecordsBySourceItemIds<T extends SlipIndexRecord & { sourceItemId: string }>(records: T[], sourceItemIds: string[]): T[];

export function prepareNamedGroupSlipIndex(
  records: Array<SlipIndexRecord & { sourceItemId: string }>,
  plan: { label: string; outputStem: string; itemIds: string[] },
  caseNumber: string,
): { fileName: string; json: string; transactionCount: number };

export function prepareSlipRecordArtifact(
  record: SlipIndexRecord,
  caseNumber: string,
  pdfPageMap?: Record<string, number>,
  generatedAt?: string,
): { fileName: string; json: string };

export function makePdfPageMapKey(source: string, sha256: string, chatPage: string): string;

export function buildSlipIndex(records: SlipIndexRecord[], caseNumber: string, generatedAt?: string, pdfPageMap?: Record<string, number>): {
  schema_version: "1.2";
  index_type: "app_detected_slip_candidates";
  source: string;
  case_number: string;
  generated_at: string;
  candidate_count: number;
  transaction_count: number;
  slip_records: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
};

export function buildSlipIndexMarkdown(index: ReturnType<typeof buildSlipIndex>): string;
