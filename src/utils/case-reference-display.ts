export function formatCaseReferenceDisplay(value: string | null | undefined): string {
  const reference = String(value ?? "").trim();
  const displayValue = reference.replace(/^(?:คดีอาญาที่|เรื่องตรวจสอบที่)\s*/u, "").trim();
  return displayValue || "012/2569";
}
