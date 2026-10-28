const DEFAULT_SOURCE_KIND = "raw_thai_law_master_reference";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function provisionId(provision) {
  return text(provision.provision_id) || text(provision.id) || null;
}

function addRule(rules, seen, provision, phrase, metadata = {}) {
  const normalizedPhrase = text(phrase);
  if (!normalizedPhrase) return;
  const key = `${provisionId(provision) || "unknown"}|${metadata.matchType || "phrase"}|${normalizedPhrase}`;
  if (seen.has(key)) return;
  seen.add(key);

  rules.push({
    phrase: normalizedPhrase,
    matchType: metadata.matchType || "phrase",
    sourceKind: DEFAULT_SOURCE_KIND,
    signalId: null,
    provisionId: provisionId(provision),
    lawId: text(provision.law_id) || text(provision.law_code) || null,
    locator: text(metadata.locator) || text(provision.section) || text(provision.source_locator) || null,
    title: text(provision.title) || null,
    note: text(provision.legal_summary) || text(metadata.note) || null,
    sourceUrl: text(provision.source_url) || text(provision.source) || null,
    sourceStatus: text(provision.coverage_status) || "current_unverified",
    sourceVersion: text(metadata.sourceVersion) || null,
    reviewStatus: "human_review_required",
    legalDecision: false,
    missingEvidence: Array.isArray(metadata.missingEvidence) ? metadata.missingEvidence : [],
    counterIndicators: Array.isArray(metadata.counterIndicators) ? metadata.counterIndicators : [],
  });
}

function addParagraphRules(rules, seen, provision, paragraph, sourceVersion) {
  for (const phrase of paragraph.exact_signals || []) {
    addRule(rules, seen, provision, phrase, {
      locator: paragraph.locator,
      matchType: "exact_signal",
      sourceVersion,
      missingEvidence: paragraph.missing_evidence,
      counterIndicators: paragraph.counter_indicators,
    });
  }
}

/**
 * Convert the user-provided RAW reference into the same review-only rule shape
 * used by the app matcher. This preserves source provenance and never creates
 * a legal conclusion.
 */
export function buildRawLegalRules(reference) {
  const rules = [];
  const seen = new Set();
  const sourceVersion = text(reference?.system_metadata?.version) || null;

  for (const provision of reference?.statutory_provisions || []) {
    for (const phrase of provision.triggers?.keywords || []) {
      addRule(rules, seen, provision, phrase, { matchType: "keyword", sourceVersion });
    }
    if (text(provision.triggers?.regex)) {
      addRule(rules, seen, provision, provision.triggers.regex, {
        matchType: "regex",
        sourceVersion,
      });
    }
    for (const paragraph of provision.paragraphs || []) {
      addParagraphRules(rules, seen, provision, paragraph, sourceVersion);
    }
  }

  return rules;
}
