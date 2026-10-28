function occurrenceKey(entry) {
  return `${entry.file_name}\u0000${entry.sha256}`;
}

export function appendUniqueManifestOccurrences(existingEntries, additions) {
  const result = [...existingEntries];
  const seen = new Set(existingEntries.map(occurrenceKey));

  for (const entry of additions) {
    const key = occurrenceKey(entry);
    if (seen.has(key)) continue;
    result.push({ ...entry, no: result.length + 1 });
    seen.add(key);
  }

  return result;
}
