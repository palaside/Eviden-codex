import dictionary from "../data/legal_signal_dictionary.json" with { type: "json" };
import rawReference from "../data/raw_thai_law_master_reference.json" with { type: "json" };
import { buildRawLegalRules } from "./raw-legal-signal-adapter.mjs";

function normalize(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return normalize(value).replace(/\s/g, "");
}

function buildRules() {
  return (dictionary.provisions ?? []).flatMap((provision) => [
    ...(provision.signals ?? [])
      .filter((signal) => ["exact_statutory_term", "user_watch_phrase"].includes(signal.kind))
      .map((signal) => ({
        phrase: signal.text,
        matchType: "phrase",
        sourceKind: signal.kind,
        signalId: signal.id ?? null,
        provision,
      })),
    ...(provision.search_phrases ?? [])
      .filter((item) => item.source_kind === "curated_review_alias")
      .map((item) => ({
        phrase: item.phrase,
        matchType: "phrase",
        sourceKind: item.source_kind,
        signalId: null,
        note: item.note ?? null,
        provision,
      })),
  ]);
}

const RULES = [
  ...buildRules(),
  ...buildRawLegalRules(rawReference),
];

/**
 * Match OCR text only. A hit is a review lead, never a legal conclusion.
 */
export function matchLegalSignalsInText(text) {
  const normalized = normalize(text);
  const compactText = normalized.replace(/\s/g, "");
  if (!normalized) return [];

  return RULES
    .filter((rule) => {
      const phrase = normalize(rule.phrase);
      if (rule.matchType === "regex") {
        try {
          return new RegExp(rule.phrase, "u").test(normalized);
        } catch {
          return false;
        }
      }
      return phrase && (normalized.includes(phrase) || compactText.includes(compact(phrase)));
    })
    .map((rule) => ({
      provisionId: rule.provisionId ?? rule.provision.id,
      lawId: rule.lawId ?? rule.provision.law_id,
      locator: rule.locator ?? rule.provision.locator,
      phrase: rule.phrase,
      sourceKind: rule.sourceKind,
      sourceUrl: rule.sourceUrl ?? null,
      sourceStatus: rule.sourceStatus ?? dictionary.review_status,
      sourceVersion: rule.sourceVersion ?? dictionary.dictionary_version,
      matchType: rule.matchType ?? "phrase",
      signalId: rule.signalId,
      note: rule.note ?? null,
      reviewStatus: "human_review_required",
      legalDecision: false,
      missingEvidence: rule.missingEvidence ?? rule.provision.missing_evidence ?? [],
      counterIndicators: rule.counterIndicators ?? rule.provision.counter_indicators ?? [],
    }));
}

export function getLegalSignalDictionaryMetadata() {
  return {
    dictionaryId: dictionary.dictionary_id,
    dictionaryVersion: dictionary.dictionary_version,
    jurisdiction: dictionary.jurisdiction,
    asOfDate: dictionary.as_of_date,
  };
}
