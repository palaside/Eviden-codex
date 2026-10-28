export interface ChatEntityOccurrence {
  sourceItemId: string;
  fileName: string;
  pageNumber: number;
  groupId: string;
  evidenceText: string;
  confidence: number;
}

export interface ChatEntityCandidate {
  id: string;
  rawName: string;
  cleanName: string;
  entityType: "PERSON" | "ORGANIZATION";
  needsReview: true;
  occurrences: ChatEntityOccurrence[];
}

export interface ChatEntityDiscoveryDiagnostics {
  chatPageCount: number;
  layer2UnitCount: number;
  textGroupCount: number;
  excludedSlipGroupCount: number;
  groupsWithNameCandidate: number;
  groupsWithoutNameCandidate: number;
}

export function discoverChatEntityOccurrences(
  pages?: Array<Record<string, unknown>>,
  knownPeople?: Array<string | { cleanName?: string; rawName?: string }>,
): ChatEntityCandidate[];

export function getChatEntityDiscoveryDiagnostics(
  pages?: Array<Record<string, unknown>>,
  knownPeople?: Array<string | { cleanName?: string; rawName?: string }>,
  entities?: ChatEntityCandidate[] | null,
): ChatEntityDiscoveryDiagnostics;
