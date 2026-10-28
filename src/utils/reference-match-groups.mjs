/**
 * @typedef {{ id: string, referenceNo: string | null | undefined }} ReferenceOccurrence
 */

/**
 * Groups occurrences that contain the same non-synthetic reference.
 * The groups are review signals only; they do not discard occurrences.
 * @param {ReferenceOccurrence[]} occurrences
 * @returns {{ normalizedReference: string, occurrences: ReferenceOccurrence[] }[]}
 */
export function findReferenceMatchGroups(occurrences) {
  const byReference = new Map();

  for (const occurrence of occurrences) {
    const reference = occurrence.referenceNo?.trim() ?? "";
    if (!reference || /^(CHAT|SLIP)-/i.test(reference)) continue;

    const normalizedReference = reference.toLocaleUpperCase();
    const group = byReference.get(normalizedReference) || [];
    group.push(occurrence);
    byReference.set(normalizedReference, group);
  }

  return Array.from(byReference, ([normalizedReference, group]) => ({
    normalizedReference,
    occurrences: group,
  })).filter((group) => group.occurrences.length > 1);
}
