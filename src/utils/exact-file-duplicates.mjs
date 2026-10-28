/** @typedef {{ id: string, fileName: string, sha256: string }} FileOccurrence */

/**
 * @param {FileOccurrence[]} occurrences
 * @returns {{ sha256: string, occurrences: FileOccurrence[] }[]}
 */
export function findExactFileDuplicateGroups(occurrences) {
  const byHash = new Map();

  for (const occurrence of occurrences) {
    if (!occurrence.sha256) continue;
    const group = byHash.get(occurrence.sha256.toLowerCase()) || [];
    group.push(occurrence);
    byHash.set(occurrence.sha256.toLowerCase(), group);
  }

  return Array.from(byHash, ([sha256, group]) => ({ sha256, occurrences: group }))
    .filter((group) => group.occurrences.length > 1);
}
