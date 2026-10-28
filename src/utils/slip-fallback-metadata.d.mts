export interface SlipFallbackMetadata {
  needs_human_review: boolean;
  unclear_fields: string[];
}

export function buildSlipFallbackMetadata(data: unknown): SlipFallbackMetadata;
