export function buildProcessingWarningEntries(items) {
  const entries = [];

  for (const item of items) {
    (item.processingWarnings || []).forEach((warning, warningIndex) => {
      entries.push({ id: `${item.id}-${warningIndex}`, warning });
    });
  }

  return entries;
}
