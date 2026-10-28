# Legal Signal Dictionary and Evidence Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a source-verifiable Thai legal signal dictionary from every law provision currently referenced by the app, and make every detected signal traceable to source evidence, matching conditions, contradictions, and missing information.

**Architecture:** Treat official consolidated legislation and Royal Gazette amendments as the only sources for verbatim statutory text. Store exact statutory wording, user watch-phrases, semantic search patterns, element logic, exclusions, and provenance as distinct typed fields in JSON. The screening engine may prioritize review but must not infer guilt or treat a keyword hit as satisfaction of an element; every output must link to evidence IDs/pages and expose contradictions and missing data.

**Tech Stack:** Existing Next.js 16 / TypeScript app, current JSON law corpus, Zod schemas, Node built-in test runner; official Thai legal sources (Royal Gazette, Council of State, relevant government agency consolidated texts).

**Versioning requirement:** Continuously monitor authoritative sources for changes to every in-scope act. When an amendment is published or takes effect, publish the new consolidated provision as the current version while retaining every prior text and dictionary mapping as immutable historical versions. Record publication date, promulgation/source identifier, effective date, detection date, affected sections/paragraphs/items/parenthetical clauses, a precise before/after change summary, and verification provenance. Never delete or overwrite the prior version; support “as of” queries so reviewers can explain what changed, when it changed, and which wording applied on a given date.

## Global Constraints

- Do not modify OCR extraction, duplicate handling, ledger behavior, PDF/SFX delivery, or authentication as part of this work.
- Never state or imply that a phrase alone proves a legal element or wrongdoing.
- Keep verbatim statutory terms separate from user watch-phrases, semantic variants, and internal search labels.
- Every verbatim phrase must have law title, section/subsection/paragraph/clause, source URL, source publication/version date, access date, and a verification status.
- Reconcile amendments and effective dates before marking any wording current; preserve superseded text with its effective period rather than overwriting history.
- Maintain an amendment registry for every tracked act. A source update must create a new immutable version and a change entry; never replace historical statutory text in place.
- Track publication, effective, detected, and verified dates separately; do not assume an act took effect on its publication date.
- Keep the latest verified-in-force version clearly designated as current, but retain previous text/signals and effective intervals for comparison and historical case dates.
- A missing dictionary match must never be treated as evidence that a legal issue is absent.
- `มี`, `ไม่มี`, `ขัดแย้ง`, `ข้อมูลไม่พอ`, and `ต้องตรวจทาน` must be evidence-backed states; `ไม่มี` requires a scoped review record, not a failed keyword search.
- No law-specific semantic rule becomes case-facing until each provision and rule has qualified legal review recorded.
- Do not send evidence or personal data to external models or services.
- No new dependencies, schema migrations, or export-format changes without separate approval.

## Current Scope Inventory

The current file `_workspaces/phase7-header-20261003/digital-evidence/src/data/thai_law_master_reference.json` contains 11 provision records:

- Penal Code sections 341 and 343 (combined), and section 352.
- Computer Crime Act section 14(1).
- Technology Crime Decree sections 9, 10, and 11 (one grouped record; amendment review required).
- Civil and Commercial Code sections 420 and 438 (combined), 406, 224, 653 paragraph one, 193/14(1), and 453.
- Electronic Transactions Act sections 8 and 9 (combined).

The 13 specialist-module scaffold also refers to Penal Code sections 342, 264/265/268, and 326/328; Computer Crime Act section 16; Civil and Commercial Code section 423 and 213; these are not all represented as dedicated current provisions. Do not silently add them to the extraction scope as if they were already active. Task 1 determines whether they belong in this dictionary's source inventory and records that decision.

## File Map

| File | Responsibility |
|---|---|
| `_workspaces/phase7-header-20261003/digital-evidence/src/data/thai_law_master_reference.json` | Existing law references and module mapping; source material, not proof of current law. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/data/legal_signal_dictionary.json` | New normalized, provenance-bearing statutory phrase and logic dictionary. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/data/legal_law_versions.json` | Immutable versions of each tracked act and section, validity intervals, authoritative source fingerprints, and amendment events. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-amendment-registry.ts` | Compare incoming official-source snapshots, append version records, and resolve the applicable version for an as-of date. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-amendment-registry.test.mjs` | Verify append-only history, date boundaries, amendment comparisons, and unchanged-source idempotency. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-source-monitor.ts` | Check configured authoritative-source pages/documents on a daily schedule and surface changed/unreachable sources for human review. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-source-monitor.test.mjs` | Verify change detection, outages, retries, and that detected changes never auto-activate legal text. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-signal-dictionary.schema.ts` | Runtime/type schema for acts, versions, provisions, elements, signals, exclusions, and review state. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-signal-matcher.ts` | Deterministic matching of source phrases/patterns to evidence facts, returning reasons and evidence references only. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-dictionary.test.mjs` | Corpus completeness, provenance, and phrase-category boundary tests. |
| `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-matcher.test.mjs` | Positive, negative, ambiguous, contradiction, and missing-data matcher tests. |
| `docs/superpowers/plans/2026-10-06-legal-signal-dictionary.md` | This implementation and legal-source review checklist. |

## Target Data Contract

```ts
type ReviewStatus = "draft_unverified" | "source_verified" | "legally_reviewed" | "superseded";
type SignalKind = "exact_statutory_term" | "user_watch_phrase" | "semantic_pattern" | "exclusion_signal";
type ElementState = "มี" | "ไม่มี" | "ขัดแย้ง" | "ข้อมูลไม่พอ" | "ต้องตรวจทาน";

interface LegalSourceRef {
  url: string;
  authority: string;
  publication_date: string | null;
  effective_from: string | null;
  effective_to: string | null;
  accessed_at: string;
  source_sha256: string | null;
}

interface LegalActVersion {
  act_id: string;
  version_id: string;
  version_label: string;
  source: LegalSourceRef;
  published_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  detected_at: string;
  verified_at: string | null;
  status: "current_verified" | "current_unverified" | "historical" | "superseded";
  text_sha256: string;
  provision_ids: string[];
}

interface LegalAmendmentEvent {
  event_id: string;
  act_id: string;
  previous_version_id: string | null;
  new_version_id: string;
  gazette_issue: string | null;
  gazette_url: string;
  published_at: string;
  effective_from: string | null;
  detected_at: string;
  verified_at: string | null;
  changed_locators: Array<{ section: string; paragraph: string | null; item: string | null; bracket: string | null }>;
  change_summary: string;
  before_sha256: string | null;
  after_sha256: string;
}

interface LegalSignal {
  id: string;
  kind: SignalKind;
  text: string;
  provenance: "statute_verbatim" | "user_supplied" | "reviewer_authored";
  priority: "urgent_review" | "normal_review";
  note: string;
}

interface LegalElement {
  id: string;
  statutory_text: string;
  source_locator: { section: string; paragraph: string | null; item: string | null; bracket: string | null };
  positive_signals: LegalSignal[];
  exclusion_signals: LegalSignal[];
  required_context: string[];
  contradicting_context: string[];
  review_status: ReviewStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
}
```

The runtime result is a screening record, not a legal opinion:

```ts
interface LegalSignalHit {
  signal_id: string;
  element_id: string;
  evidence_fact_ids: string[];
  evidence_pages: Array<number | string | null>;
  matched_text: string;
  match_method: "exact_phrase" | "normalized_phrase" | "reviewed_pattern";
  state: ElementState;
  explanation: string;
  contradicting_fact_ids: string[];
  missing_items: string[];
}
```

## Implementation Tasks

### Task 1: Freeze and reconcile the law inventory

**Files:**
- Read: `_workspaces/phase7-header-20261003/digital-evidence/src/data/thai_law_master_reference.json`
- Modify: `docs/superpowers/plans/2026-10-06-legal-signal-dictionary.md`
- Test: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-dictionary.test.mjs`

- [ ] Write a failing inventory test asserting the 11 current record IDs and the exact section identifiers above.
- [ ] Run `node --test src/utils/__tests__/legal-signal-dictionary.test.mjs`; confirm missing inventory fails.
- [ ] Compare each law against official consolidated text and Gazette amendment records; record title, official URL, publication date, effective date, and which current JSON claims are not supported verbatim.
- [ ] Record 342, 264/265/268, 326/328, 16, 423, and 213 as prompt-only/missing provisions unless the product owner explicitly expands the corpus; do not treat neighboring or conceptually similar sections as substitutes.
- [ ] For the Technology Crime Decree, locate and reconcile every amendment effective as of the review date; do not use the 2023 text as current if a later amendment changes the section.
- [ ] Keep every source-review status draft until primary source and effective-date comparison is complete.

### Task 2: Add append-only act-version and amendment registry

**Files:**
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/data/legal_law_versions.json`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-amendment-registry.ts`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-amendment-registry.test.mjs`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-source-monitor.ts`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-source-monitor.test.mjs`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-signal-dictionary.schema.ts`

**Interfaces:** `appendActVersion(registry, snapshot): AmendmentRegistryResult`; `getActVersionAsOf(registry, actId, date): LegalActVersion | null`; `compareActVersions(previous, next): LegalAmendmentEvent`.

- [ ] Write tests that adding an amended act preserves its prior version unchanged, appends an event with before/after hashes, and points current version to the new record only after source verification.
- [ ] Write tests proving unchanged source hashes are idempotent and do not create duplicate amendment events.
- [ ] Write date-boundary tests: the old version applies before `effective_from`, the new one applies on/after `effective_from`, and unknown effective dates remain unresolved rather than guessed.
- [ ] Implement append-only registry behavior. Reject updates that mutate existing version text or hashes; create a new version ID for any changed source text.
- [ ] Compare section locators and text hashes to identify changed, added, and repealed sections, paragraphs, items, and parenthetical clauses. Require human-reviewed `change_summary`; automated diff may suggest changes but cannot certify legal meaning.
- [ ] Store publication date, effective date, detection date, source authority/URL, Gazette issue, verification date/reviewer, and source text SHA-256 separately.
- [ ] Add an “as of date” query that returns both applicable statutory wording and its linked signal-dictionary version.
- [ ] Implement daily checks against the configured official source URLs using the existing runtime and dependencies; record last-successful-check, source hash/ETag when available, and source availability.
- [ ] Treat changed, redirected, or unreachable pages as a review alert. Never interpret a changed HTML hash as proof of a statutory amendment and never auto-activate downloaded text.
- [ ] Surface “last checked”, “source changed; review pending”, or “source unavailable; freshness unknown” to reviewers. If reliable daily execution needs a new scheduler/service or infrastructure change, stop and obtain separate approval before adding it.

### Task 3: Extract statutory text by exact legal locator

**Files:**
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/data/legal_signal_dictionary.json`
- Test: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-dictionary.test.mjs`

- [ ] For each in-scope provision, transcribe only the applicable section text, preserving paragraph breaks, numbered items, and parenthetical subitems; include adjacent exceptions/definitions only when they qualify or limit that section.
- [ ] Store one element per legally meaningful clause with an exact locator (`section`, `paragraph`, `item`, `bracket`) and source reference; do not replace the statute's wording with a summary.
- [ ] Add one dictionary record for each section. Split grouped source entries (for example 341 vs 343 and 420 vs 438) into separate records while retaining links to the originating JSON record.
- [ ] Test that every current source section has at least one provision record; every verbatim text has a source URL and locator; and no `draft_unverified` provision is labeled legally reviewed.
- [ ] Compare a second time against the source text and preserve a review note for OCR ambiguity, unavailable authoritative consolidation, or amendment uncertainty rather than silently normalizing it.

### Task 4: Build a separate signal vocabulary

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/data/legal_signal_dictionary.json`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-signal-dictionary.schema.ts`
- Test: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-dictionary.test.mjs`

- [ ] Add exact statutory terms only when those exact words occur in the cited provision, marked `exact_statutory_term` and `statute_verbatim`.
- [ ] Add user examples such as “ยืมหน่อย” and “ยืมไปลงทุนก่อน” only as `user_watch_phrase` with `user_supplied` provenance; never label them as statutory wording unless verified verbatim in the cited law.
- [ ] Add paraphrases and contextual patterns only as `semantic_pattern`, with author, rationale, positive context, exclusions, and human-review requirement; an unreviewed pattern stays disabled.
- [ ] Add negative/exclusion patterns separately; absence of a phrase is never a negative signal.
- [ ] Validate the JSON at runtime with the schema and reject unknown signal kinds, missing provenance, empty locators, or source-less statutory terms.
- [ ] Add tests proving phrase categories cannot be interchanged and unverified patterns cannot produce active hits.

### Task 5: Implement deterministic, traceable screening

**Files:**
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-signal-matcher.ts`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-matcher.test.mjs`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-triage.schema.ts`

- [ ] Add failing tests for exact phrase hit, normalized whitespace/punctuation hit, an unrelated phrase, OCR-review-only input, and repeated phrase occurrences on different pages.
- [ ] Add negative tests proving a matched phrase alone cannot set an element to `มี`, cannot set a legal-result status, and cannot prove intent, deception, causation, identity, loss, or another context-dependent element.
- [ ] Add tests for support plus contradiction (`ขัดแย้ง`), no evidence (`ข้อมูลไม่พอ`), only unreviewed evidence (`ต้องตรวจทาน`), and absence established only by an explicit scoped reviewer check (`ไม่มี`).
- [ ] Implement `matchLegalSignals(facts, dictionary): LegalSignalHit[]`; output exact fact IDs/pages, source signal ID, match method, matched substring, contradictory fact IDs, missing context, and review status.
- [ ] Make urgent watch phrases sort to the top of a review queue, not increase a guilt/probability score. Do not impose a global phrase-match threshold that suppresses unlisted paraphrases.
- [ ] Ensure unmatched or low-confidence records remain discoverable through a separate “unmatched / manual review” bucket.

### Task 6: Render review information without legal overclaim

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/app/page.tsx`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/components/MasterDossierFullBook.tsx`
- Test: existing UI/PDF contract tests or focused tests added after inspecting local test conventions.

- [ ] Show the exact detected text, source page, OCR/review state, matched dictionary phrase, statutory locator, source version, and whether the phrase was statutory, user-supplied, or reviewer-authored.
- [ ] Show matching criteria, supporting evidence, counterevidence, unresolved context, and follow-up checks in separate fields.
- [ ] Use wording “พบสัญญาณให้ตรวจต่อ” and “ข้อมูลไม่พอ”; never render a phrase hit as “ผิด”, a legal element satisfied, or an approved legal recommendation.
- [ ] Keep draft/unverified legal content out of client/court PDF. Internal review may show it only with a persistent draft warning and source provenance.
- [ ] Preserve direct PDF and SFX behavior and verify PDF/SFX payloads are unchanged except for explicitly approved report text.

### Task 7: Completeness, source audit, and acceptance

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-dictionary.test.mjs`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-signal-matcher.test.mjs`
- Modify: this plan with source review results and corpus version.

- [ ] Run corpus completeness tests across every in-scope section, paragraph, numbered item, and parenthetical subitem in the authoritative text.
- [ ] Independently compare extracted wording against the official source; record reviewer and date for each section, not only at corpus level.
- [ ] Have a qualified Thai legal reviewer approve or reject each element mapping, semantic pattern, exclusion, and context requirement before activating it.
- [ ] Run `node --test src/utils/__tests__/legal-signal-dictionary.test.mjs src/utils/__tests__/legal-signal-matcher.test.mjs src/utils/__tests__/legal-triage.test.mjs src/utils/__tests__/legal-timeline.test.mjs`.
- [ ] Run `npx tsc --noEmit` and the relevant app/PDF tests; record unrelated pre-existing failures separately.
- [ ] Do not call the extraction “complete” until every in-scope source locator is accounted for, amendment status is checked, and exceptions/parentheses are preserved or explicitly marked not applicable.

## Acceptance Criteria

- Every law section currently claimed by the app is either extracted with a verified source and exact locator or visibly listed as unresolved/out of scope.
- Every source update creates a new immutable act/provision/signal version and a dated amendment event; previous wording remains retrievable.
- A reviewer can query any tracked date and see the then-applicable text, later amendment text, publication/effective dates, exact changed locators, and the recorded human-reviewed change summary.
- Every phrase is explicitly classified as statutory wording, user watch phrase, or authored semantic pattern.
- A match can always be traced to evidence record, page, text fragment, dictionary entry, matching method, law version, and reviewer state.
- Contradictory evidence and missing context remain visible; keyword absence cannot produce `ไม่มี`.
- A watch phrase raises review priority only and never yields a legal conclusion by itself.
- No unreviewed provision or semantic pattern is promoted to client/court-facing legal guidance.

## Execution Handoff

This work has two approval gates: product-owner confirmation of whether prompt-only missing provisions should be added, and qualified legal review before activation. Source extraction and draft dictionary construction may proceed without activating any legal inference.
