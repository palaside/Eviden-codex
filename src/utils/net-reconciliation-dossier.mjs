export function buildNetReconciliationDossier({ caseNumber, generatedAt, occurrences, summary }) {
  const occurrenceById = new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const serializeOccurrence = (occurrence) => ({
    id: occurrence.id,
    source_file: occurrence.source,
    source_sha256: occurrence.sha256 || null,
    physical_page: occurrence.dossierPage ?? null,
    reference_id: occurrence.referenceNo || null,
    amount_thb: typeof occurrence.amount === "number" && Number.isFinite(occurrence.amount) ? occurrence.amount : null,
    status: occurrence.isConfirmed ? "confirmed_by_reviewer" : "pending_review",
  });

  return {
    schema_version: "1.0",
    report_type: "NET_RECONCILIATION_REVIEW",
    case_number: caseNumber,
    generated_at: generatedAt,
    review_only: true,
    automatic_deduplication: false,
    disclaimer: "This is a review record, not a legal certification. Gross totals remain unchanged; duplicate exclusions apply only to reviewed NET calculations.",
    totals: {
      confirmed_occurrences: occurrences.filter((occurrence) => occurrence.isConfirmed).length,
      pending_occurrences: occurrences.filter((occurrence) => !occurrence.isConfirmed).length,
      gross_confirmed_amount: summary.grossConfirmedAmount,
      reviewed_excluded_amount: summary.reviewedExcludedAmount,
      reviewed_net_amount: summary.reviewedNetAmount,
      resolved_duplicate_groups: summary.resolvedDuplicateGroupCount,
      confirmed_distinct_groups: summary.distinctGroupCount,
      unresolved_duplicate_groups: summary.unresolvedGroupCount,
    },
    reference_groups: summary.groups.map((group) => ({
      reference_id: group.referenceNo,
      disposition: group.disposition,
      master_occurrence_id: group.masterOccurrenceId || null,
      occurrence_ids: [...group.occurrenceIds],
      excluded_occurrence_ids: [...group.excludedOccurrenceIds],
      excluded_amount_thb: group.excludedAmount,
      occurrences: group.occurrenceIds
        .map((id) => occurrenceById.get(id))
        .filter(Boolean)
        .map(serializeOccurrence),
    })),
    occurrences: occurrences.map(serializeOccurrence),
  };
}
