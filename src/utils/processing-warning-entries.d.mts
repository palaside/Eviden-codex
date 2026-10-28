export function buildProcessingWarningEntries(items: Array<{
  id: string;
  processingWarnings?: string[];
}>): Array<{ id: string; warning: string }>;
