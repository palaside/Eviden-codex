export interface ConfirmedSlipRecordInput {
  id: string;
  isConfirmed: boolean;
  amount: number | null | undefined;
  referenceNo: string | null | undefined;
}

export type DuplicateReferenceResolution =
  | { disposition: "distinct"; occurrenceIds: string[] }
  | { disposition: "duplicate"; masterOccurrenceId: string; occurrenceIds: string[] };

export interface ReviewedDuplicateReferenceSummary {
  grossConfirmedAmount: number;
  reviewedExcludedAmount: number;
  reviewedNetAmount: number;
  excludedOccurrenceIds: string[];
  resolvedDuplicateGroupCount: number;
  distinctGroupCount: number;
  unresolvedGroupCount: number;
  groups: Array<{
    referenceNo: string;
    occurrenceIds: string[];
    occurrenceCount: number;
    grossAmount: number;
    disposition: "duplicate" | "distinct" | "unresolved";
    masterOccurrenceId?: string;
    excludedOccurrenceIds: string[];
    excludedAmount: number;
  }>;
}

export function formatSlipReviewCounts(summary: { detectedCount: number; slipCount: number }) {
  return `พบ ${summary.detectedCount} · ยืนยัน ${summary.slipCount} รายการ`;
}

export function groupConfirmedSlipReferences(records: ConfirmedSlipRecordInput[]) {
  const groups = new Map<string, { referenceNo: string; occurrenceIds: string[]; grossAmount: number }>();

  for (const record of records) {
    if (!record.isConfirmed) continue;
    const rawReference = record.referenceNo?.trim() ?? "";
    if (!rawReference || /^(CHAT|SLIP)-/i.test(rawReference)) continue;
    const referenceNo = rawReference.toLocaleUpperCase();
    const group = groups.get(referenceNo) ?? { referenceNo, occurrenceIds: [], grossAmount: 0 };
    group.occurrenceIds.push(record.id);
    if (typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount > 0) {
      group.grossAmount += record.amount;
    }
    groups.set(referenceNo, group);
  }

  return [...groups.values()]
    .filter((group) => group.occurrenceIds.length > 1)
    .map((group) => ({ ...group, occurrenceCount: group.occurrenceIds.length }));
}

export function reconcileReviewedDuplicateReferences(
  records: ConfirmedSlipRecordInput[],
  resolutions: Record<string, DuplicateReferenceResolution>,
): ReviewedDuplicateReferenceSummary {
  const confirmed = records.filter((record) => record.isConfirmed);
  const grossConfirmedAmount = confirmed.reduce((total, record) => (
    total + (typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount > 0 ? record.amount : 0)
  ), 0);
  const repeatedGroups = groupConfirmedSlipReferences(records);
  const excludedOccurrenceIds: string[] = [];
  let reviewedExcludedAmount = 0;
  let resolvedDuplicateGroupCount = 0;
  let distinctGroupCount = 0;
  let unresolvedGroupCount = 0;
  const reviewedGroups: ReviewedDuplicateReferenceSummary["groups"] = [];

  for (const group of repeatedGroups) {
    const resolution = resolutions[group.referenceNo];
    const reviewedOccurrenceIds = resolution?.occurrenceIds?.slice().sort();
    const currentOccurrenceIds = group.occurrenceIds.slice().sort();
    const membershipMatches = reviewedOccurrenceIds?.length === currentOccurrenceIds.length
      && reviewedOccurrenceIds.every((id, index) => id === currentOccurrenceIds[index]);
    if (!membershipMatches) {
      unresolvedGroupCount += 1;
      reviewedGroups.push({ ...group, disposition: "unresolved", excludedOccurrenceIds: [], excludedAmount: 0 });
      continue;
    }

    if (resolution?.disposition === "distinct") {
      distinctGroupCount += 1;
      reviewedGroups.push({ ...group, disposition: "distinct", excludedOccurrenceIds: [], excludedAmount: 0 });
      continue;
    }

    if (resolution?.disposition !== "duplicate" || !group.occurrenceIds.includes(resolution.masterOccurrenceId)) {
      unresolvedGroupCount += 1;
      reviewedGroups.push({ ...group, disposition: "unresolved", excludedOccurrenceIds: [], excludedAmount: 0 });
      continue;
    }

    const groupRecords = confirmed.filter((record) => group.occurrenceIds.includes(record.id));
    const duplicates = groupRecords.filter((record) => record.id !== resolution.masterOccurrenceId);
    if (groupRecords.length !== group.occurrenceIds.length || duplicates.length === 0 || groupRecords.some((record) => (
      typeof record.amount !== "number" || !Number.isFinite(record.amount) || record.amount <= 0
    ))) {
      unresolvedGroupCount += 1;
      reviewedGroups.push({ ...group, disposition: "unresolved", excludedOccurrenceIds: [], excludedAmount: 0 });
      continue;
    }

    resolvedDuplicateGroupCount += 1;
    const groupExcludedAmount = duplicates.reduce((total, duplicate) => total + duplicate.amount!, 0);
    reviewedGroups.push({
      ...group,
      disposition: "duplicate",
      masterOccurrenceId: resolution.masterOccurrenceId,
      excludedOccurrenceIds: duplicates.map((duplicate) => duplicate.id),
      excludedAmount: groupExcludedAmount,
    });
    for (const duplicate of duplicates) {
      excludedOccurrenceIds.push(duplicate.id);
      reviewedExcludedAmount += duplicate.amount!;
    }
  }

  return {
    grossConfirmedAmount,
    reviewedExcludedAmount,
    reviewedNetAmount: Math.max(0, grossConfirmedAmount - reviewedExcludedAmount),
    excludedOccurrenceIds,
    resolvedDuplicateGroupCount,
    distinctGroupCount,
    unresolvedGroupCount,
    groups: reviewedGroups,
  };
}

export function summarizeConfirmedSlipRecords(records: ConfirmedSlipRecordInput[]) {
  const seenReferences = new Set<string>();
  let slipCount = 0;
  let duplicateCount = 0;
  let pendingCount = 0;
  let totalAmount = 0;
  let potentialDuplicateAmount = 0;

  for (const record of records) {
    if (!record.isConfirmed) {
      pendingCount += 1;
      continue;
    }

    const rawReference = record.referenceNo?.trim() ?? "";
    const reference = /^(CHAT|SLIP)-/i.test(rawReference) ? "" : rawReference.toLocaleUpperCase();
    const repeatsReference = !!reference && seenReferences.has(reference);
    if (repeatsReference) {
      duplicateCount += 1;
    }
    if (reference) seenReferences.add(reference);

    slipCount += 1;
    if (typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount > 0) {
      totalAmount += record.amount;
      if (repeatsReference) potentialDuplicateAmount += record.amount;
    }
  }

  return {
    detectedCount: records.length,
    pendingCount,
    slipCount,
    duplicateCount,
    totalAmount,
    potentialDuplicateAmount,
    provisionalNetAmount: Math.max(0, totalAmount - potentialDuplicateAmount),
  };
}
