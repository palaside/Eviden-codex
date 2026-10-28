export type ManifestOccurrence = {
  no: number;
  file_name: string;
  file_type: string;
  size_bytes: number;
  sha256: string;
  intake_timestamp: string;
};
export function appendUniqueManifestOccurrences(
  existingEntries: ManifestOccurrence[],
  additions: ManifestOccurrence[],
): ManifestOccurrence[];
