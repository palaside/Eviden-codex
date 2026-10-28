# Integrated Forensic Legal Triage Implementation Plan

> **For agentic workers:** Use the `executing-plans` skill to implement this plan task-by-task. Keep each task independently testable and request legal-data approval where its gate requires it.

**Goal:** Combine the app's validated evidence records with the user's legal Master Prompt framework to produce traceable, non-conclusive legal triage, behavioral routing, an evidence matrix, and a matching UI/PDF section.

**Architecture:** Keep the existing OCR, canonical evidence, ledger, and direct PDF/SFX export paths as the evidence system of record. Add a deterministic legal-triage pipeline that routes evidence to 13 named specialist rule modules, evaluates mapped legal elements, preserves conflicts and missing information, and returns page-linked results; do not add autonomous LLM agents or external data transmission in this phase. Treat the user's prompt and current JSON as source material that must be reconciled and legally reviewed before its rules are activated.

**Tech Stack:** Existing Next.js 16 / React 19 / TypeScript app, existing Zod schemas, JSON legal-reference data, Node built-in test runner, existing Python PDF exporter.

## Global Constraints

- Do not change the existing OCR, duplicate-handling, ledger, direct-PDF, or SFX delivery behavior except for passing legal-report data into its already-intended report section.
- Never convert OCR uncertainty or a keyword hit into a confirmed fact or a legal conclusion.
- Keep raw evidence and SHA-256/source references; any sanitized quote shown to a legal module must retain a link to its unmodified evidence record.
- A payment slip alone must not establish intent to deceive; assess chat/context and transaction linkage separately.
- Report only “อาจเกี่ยวข้อง/ควรตรวจต่อ”; never state a person is guilty or that an offence is proven.
- Preserve the element states `มี`, `ไม่มี`, `ขัดแย้ง`, `ข้อมูลไม่พอ`, and `ต้องตรวจทาน`; do not collapse conflict, absence, and unknown into one state.
- Route the 13 specialist modules deterministically in this phase. Do not add an LLM, an agent framework, network calls, or dependencies without explicit approval.
- Treat the supplied 85–95%, 80–90%, 70–85%, and 60–80% estimates as unverified hypotheses, not product claims or acceptance results.
- Validate every legal provision, amendment, exception, trigger, and source citation against primary Thai legal sources and obtain qualified legal review before enabling it for case-facing use.
- Keep `RAW/New folder/Master Prompt_Digital Evidence Agent System.md`, `generate_agents.py`, and `structure.txt` read-only source material.

---

## Current Evidence and Gaps

- Active app copy: `_workspaces/phase7-header-20261003/digital-evidence`.
- Current integration starts in `src/app/page.tsx`: it imports `src/data/thai_law_master_reference.json`, normalizes rules, derives facts from canonical records, runs `runLegalTriage`, builds the matrix, and renders a modal.
- Current legal logic is in `src/utils/legal-triage.ts`; regression tests are in `src/utils/__tests__/legal-triage.test.mjs`.
- Current reference data reports version `1.1.0`, `last_updated` `2026-09-27`, and lists 11 statutory provisions. The user's Master Prompt scaffold lists 13 specialist agents. Reconcile these lists explicitly; do not assume one agent equals one statutory provision.
- Current `normalizeLegalRules()` maps triggers, required/optional elements, exclusions, and `legal_summary`, but drops `related_laws` and `court_annotation_template`. The display does not currently present a verifiable per-rule source citation.
- Current `factMatchesRule()` can match any validated money transfer to every civil/criminal rule. Current element assignment uses broad Thai word tests rather than rule-specific evidence predicates. This is too broad for a dependable legal triage result.
- Current canonical chat record stores OCR text as an array of strings without a guaranteed per-message speaker, message timestamp, or turn boundary. Timeline claims must use only time/page metadata actually present; unavailable event time must remain unknown.
- Existing legal tests use a small inline fixture. They do not validate all 11 JSON provisions, all 13 prompt modules, the user's actual case, legal currency, or end-to-end browser/PDF output.

## File Map

| File | Responsibility in this plan |
| --- | --- |
| `src/schemas/legal-triage.schema.ts` | Typed legal facts, route result, element evaluation, and report contracts. |
| `src/utils/legal-triage.ts` | Existing normalization/fact extraction; keep as public facade or split only when tests show a clear boundary. |
| `src/utils/legal-timeline.ts` | Evidence-event ordering with explicit timestamp precision and unknown-time handling. |
| `src/utils/legal-behavior-router.ts` | Deterministic routing from evidence signals to the 13 specialist module IDs. |
| `src/utils/legal-element-evaluator.ts` | Rule-specific element evaluation, conflict handling, and missing-element reasons. |
| `src/data/thai_law_master_reference.json` | Versioned legal rules, per-rule sources, routing signals, element predicates, and review status. |
| `src/app/page.tsx` | Existing legal modal orchestration; render route rationale, matrix states, refs, and missing items. |
| `src/components/MasterDossierFullBook.tsx` | Render the same non-conclusive legal summary and traceable matrix in the existing PDF report. |
| `src/utils/__tests__/legal-triage.test.mjs` | Unit/regression tests for schema normalization, fact safety, routing, matrix, and negative cases. |
| `src/utils/__tests__/legal-timeline.test.mjs` | Event order and unknown-time tests. |
| `src/utils/__tests__/legal-behavior-router.test.mjs` | Route coverage and false-positive guards for all 13 module IDs. |
| `src/utils/__tests__/legal-element-evaluator.test.mjs` | Element status, conflict, missing evidence, and citation tests. |
| `src/data/__tests__/thai-law-reference.test.mjs` | Corpus contract and 11-provision/13-module reconciliation tests. |

Do not create a second OCR pipeline or duplicate the Canonical Evidence source of truth. Do not restructure unrelated oversized UI/PDF components as part of this feature.

## Target Contracts

The implementation must converge on these contracts before UI/PDF work. Names may follow established local conventions, but required semantics may not be weakened.

```ts
export type EvidenceTimePrecision = "exact" | "date_only" | "page_order_only" | "unknown";

export interface LegalEvidenceFact {
  id: string;
  sourceRecordId: string;
  sourceType: "CHAT" | "SLIP" | "HYBRID";
  pageNumber: number | string | null;
  sourceSha256: string | null;
  quote: string | null;
  factType: string;
  time: string | null;
  timePrecision: EvidenceTimePrecision;
  refId: string | null;
  amount: number | null;
  validation: "validated" | "corrected_by_human" | "needs_review" | "unreadable";
  reviewReasons: string[];
}

export interface LegalRuleSource {
  title: string;
  url: string;
  sourceType: "primary_law" | "court_decision" | "user_reference";
  checkedAt: string | null;
  checkedBy: string | null;
}

export interface LegalRuleElement {
  id: string;
  label: string;
  supportSignalIds: string[];
  contradictionSignalIds: string[];
  absenceSignalIds: string[];
  followUpQuestion: string;
}

export interface LegalRule {
  id: string;
  moduleId: string;
  lawName: string;
  section: string;
  area: "civil" | "criminal" | "special_law" | "procedure";
  reviewStatus: "draft_unverified" | "reviewed" | "disabled";
  elements: LegalRuleElement[];
  sources: LegalRuleSource[];
  relatedLaws: string[];
  legalSummary: string;
  courtAnnotationTemplate: string | null;
  exclusionWarnings: string[];
}

export interface LegalRuleCorpus {
  version: string;
  modules: Array<{ id: string; kind: "legal_rule" | "global_safeguard"; mappedRuleIds: string[] }>;
  rules: LegalRule[];
  disclaimer: string;
}

export interface LegalTimelineEvent {
  id: string;
  eventType: string;
  label: string;
  time: string | null;
  timePrecision: EvidenceTimePrecision;
  sourceRecordIds: string[];
  sourceFactIds: string[];
  pageRefs: Array<{ sourceType: "CHAT" | "SLIP" | "HYBRID"; pageNumber: number | string | null }>;
  linkage: "confirmed_ref_id" | "possible_link" | "unlinked" | "conflicting";
}

export interface LegalElementEvaluation {
  elementId: string;
  label: string;
  status: "มี" | "ไม่มี" | "ขัดแย้ง" | "ข้อมูลไม่พอ" | "ต้องตรวจทาน";
  supportingFactIds: string[];
  contradictingFactIds: string[];
  missingReason: string | null;
  followUpQuestion: string | null;
}

export interface LegalSpecialistRoute {
  moduleId: string;
  triggered: boolean;
  triggerSignalIds: string[];
  excludedBySignalIds: string[];
  evidenceFactIds: string[];
}

export interface LegalTriageReport {
  caseNumber: string;
  generatedAt: string;
  legalCorpusVersion: string;
  disclaimer: string;
  facts: LegalEvidenceFact[];
  timeline: LegalTimelineEvent[];
  routes: LegalSpecialistRoute[];
  evaluations: LegalElementEvaluation[];
  matrix: EvidenceMatrixRow[];
}
```

Required function signatures:

```ts
export function buildLegalTimeline(facts: LegalEvidenceFact[]): LegalTimelineEvent[];
export function routeLegalSpecialists(facts: LegalEvidenceFact[], corpus: LegalRuleCorpus): LegalSpecialistRoute[];
export function evaluateLegalElements(facts: LegalEvidenceFact[], rule: LegalRule): LegalElementEvaluation[];
export function buildLegalTriageReport(records: CanonicalEvidenceRecord[], corpus: LegalRuleCorpus): LegalTriageReport;
```

Every displayed legal assertion must resolve through `supportingFactIds` or `contradictingFactIds` to a record with page/source metadata. If a quote, exact time, speaker, linkage, or legal element cannot be substantiated by stored input, render it as unavailable/unknown rather than synthesizing it.

## Implementation Tasks

### Task 1: Reconcile and version the legal source corpus

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/data/thai_law_master_reference.json`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/data/__tests__/thai-law-reference.test.mjs`
- Read-only sources: `RAW/New folder/Master Prompt_Digital Evidence Agent System.md`, `RAW/New folder/generate_agents.py`, `RAW/New folder/structure.txt`

**Gate:** Before changing activated legal content, list all 13 prompt modules against the current JSON's 11 provision records. Record combined modules, missing provisions, and prompt-only safeguards. A qualified legal reviewer must validate each provision and the cited source/version; until then, keep affected records marked `draft_unverified` and suppress them from case-facing recommendations.

- [x] **Step 1: Add failing corpus-contract tests.** Assert that the JSON has a version, corpus review state, and for every provision an explicit rule review state and source list. Assert that the 13 module IDs from the prompt have explicit mapping rows, even where a module is a global safeguard or a missing-rule placeholder. Require primary-source citations with URL and verification date only before a rule can move out of `draft_unverified`.
- [x] **Step 2: Run the focused test and confirm it fails on missing source/reconciliation fields.**

Run: `node --test src/data/__tests__/thai-law-reference.test.mjs`

Expected before implementation: FAIL because current records lack per-rule verified-source metadata and the 13-module mapping.
- [x] **Step 3: Add version and reconciliation metadata.** Add `agent_modules`, `unmapped_rule_ids`, `review_status`, and `sources`. Use `draft_unverified` for every current provision because no item-level legal review evidence exists. Preserve existing source text as user-provided reference material; do not silently rewrite it as verified legal advice.
- [x] **Step 4: Re-run the corpus test.** The test must confirm every module is mapped and every non-draft rule has source/review metadata; draft entries must not be treated as active candidates.
- [ ] **Step 5: Obtain and record legal-source review before activating draft entries.** Do not infer that the JSON's `official_sources` list proves each individual section or summary is current.

Until review is provided, the app may show an internal draft analysis with a persistent `UNVERIFIED LEGAL REFERENCE` label. Do not include draft legal suggestions in a client/court PDF or present them as approved recommendations.

### Task 2: Define evidence-backed events and timeline semantics

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-triage.schema.ts`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-timeline.ts`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-timeline.test.mjs`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-triage.test.mjs`

- [x] **Step 1: Write failing tests for exact, date-only, page-order-only, and unknown event time.** Include shuffled source records; assert known exact times sort chronologically, same-date unknown-time items keep only a labeled page order, and unknown dates never receive fabricated timestamps.
- [x] **Step 2: Run `node --test src/utils/__tests__/legal-timeline.test.mjs` and confirm the absent timeline helper fails.**
- [x] **Step 3: Implement a pure timeline function.** Export `buildLegalTimeline(facts: LegalEvidenceFact[]): LegalTimelineEvent[]`; retain source record ID, page number, time precision, and fact IDs. Sort exact timestamps first, then date-only, then page-order-only, and unknown last without claiming causal order.
- [x] **Step 4: Add cross-record linkage only from observed fields.** Match CHAT/SLIP on normalized Ref ID first. Amount/date/time may create a `possible_link` for human review only; never silently upgrade it to a confirmed match. Preserve unmatched and conflicting occurrences.
- [x] **Step 5: Test and record the data boundary.** Current CHAT OCR is page-level and does not identify individual message turns, speaker, or event timestamps; it receives page-order-only when a page reference exists. A future OCR feature requires separate approval.

### Task 3: Add deterministic behavioral routing for all 13 specialist modules

**Files:**
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-behavior-router.ts`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-behavior-router.test.mjs`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-triage.schema.ts`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/data/thai_law_master_reference.json`

- [ ] **Step 1: Write a table-driven failing test for all 13 module IDs.** Cover alleged fraud, aggravated fraud, public fraud, document/slip forgery, criminal defamation, computer false-data/image-tampering, civil tort/defamation/unjust enrichment/breach of contract, PDPA masking, and electronic-transaction/custody safeguards. Each route must expose matched signal IDs and supporting evidence IDs.
- [ ] **Step 2: Add negative controls.** A transfer receipt by itself must not route as fraud; the word “โกง” alone must not route as proven fraud; ordinary delayed delivery with continuing communication must not automatically route as fraud; image tampering must not be detected unless a visual-forensics signal actually exists; absence of a message is not evidence that a party blocked/deleted it.
- [ ] **Step 3: Run `node --test src/utils/__tests__/legal-behavior-router.test.mjs` and verify RED.**
- [ ] **Step 4: Implement `routeLegalSpecialists(facts, rules): LegalSpecialistRoute[]`.** Use explicit per-module signals and exclusions; run privacy/custody checks as safeguards. The router selects candidate modules only and emits no legal conclusion.
- [ ] **Step 5: Run the table-driven tests.** Assert deterministic routing, no route without evidence, and reasons are traceable to actual fact IDs.

### Task 4: Replace generic element guesses with rule-specific evaluation

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-triage.schema.ts`
- Modify or split: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-triage.ts`
- Create if needed: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-element-evaluator.ts`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-element-evaluator.test.mjs`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-triage.test.mjs`

- [ ] **Step 1: Write failing tests for each element state.** `มี` requires at least one validated/corrected support fact; `ไม่มี` requires an explicit, scoped, human-reviewable check establishing absence; `ขัดแย้ง` requires both support and contradiction refs; `ข้อมูลไม่พอ` means evidence is absent/insufficient; `ต้องตรวจทาน` means only unvalidated evidence is available.
- [x] **Step 2: Add a regression test showing that one validated transfer does not satisfy every civil/criminal element and does not match every law.** This failed against the broad transfer fallback; the fallback was removed and the test now passes. Rule-specific element evaluation remains pending.
- [ ] **Step 3: Run `node --test src/utils/__tests__/legal-element-evaluator.test.mjs src/utils/__tests__/legal-triage.test.mjs` and confirm the new cases fail.**
- [ ] **Step 4: Implement rule-specific element predicates and exclusion checks.** Consume the route result and facts. Return supporting IDs, contradicting IDs, missing reason, and a concrete follow-up question. Do not score legal probability using a ratio of fact count to element count; if a score remains for UI sorting, label it as a technical evidence-coverage indicator and keep it separate from legal likelihood.
- [ ] **Step 5: Preserve normalization fields.** Carry through `related_laws`, `court_annotation_template`, per-rule sources, and review status with types. Only show legal summaries/annotations for rules that passed the corpus review gate.
- [ ] **Step 6: Run both focused suites and ensure the transfer-only and ambiguity regressions pass.**

### Task 5: Add one orchestrated report object with provenance

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/schemas/legal-triage.schema.ts`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/legal-triage.ts`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/utils/__tests__/legal-triage.test.mjs`

- [ ] **Step 1: Write failing orchestration tests.** Given canonical records and a versioned corpus, assert the report contains corpus version, generation time, timeline, 13 route outcomes, candidate laws, evidence matrix, and disclaimer. Every matrix ref must resolve to a fact and canonical record/page.
- [ ] **Step 2: Implement `buildLegalTriageReport(records, corpus): LegalTriageReport`.** Its fixed order is: safe fact extraction -> timeline -> deterministic routing -> rule-specific element evaluation -> matrix assembly. Accept no free-form user prompt as executable rule logic.
- [ ] **Step 3: Add privacy boundary tests.** Mask personal identifiers only in rendered quotations/output copies, retain the raw source record locally, and ensure no external network or model request is made.
- [ ] **Step 4: Run the legal unit suite.** Require coverage for all statuses, all 13 routes, unsupported OCR, unmatched slips, duplicate occurrences, contradictory records, and missing page/time fields.

### Task 6: Render the same report in the UI and Master PDF

**Files:**
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/app/page.tsx`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/src/components/MasterDossierFullBook.tsx`
- Modify: relevant existing UI/PDF tests; create focused tests only if no local test covers the component contract.

- [ ] **Step 1: Add a component-contract test fixture.** Include one supported fact, one contradiction, one unreviewed OCR fact, one missing element, and one unknown event time.
- [ ] **Step 2: Update the UI to consume one `LegalTriageReport`.** Show: candidate law and review status; why the specialist module was routed; evidence quote/type/page/hash reference; CHAT-SLIP linkage status; timeline precision; element state; contradiction; missing element; specific next evidence to request; source citation/version; disclaimer.
- [ ] **Step 3: Update the PDF section to render the same report contract.** Do not rerun a second independent legal analysis inside the PDF renderer. Use the same element statuses and evidence references as the UI; paginate the matrix without dropping source page references.
- [ ] **Step 4: Keep the language non-conclusive.** Use “อาจเกี่ยวข้อง”, “ข้อมูลไม่พอ”, and “ควรตรวจต่อ”; prohibit “ผิดแน่นอน”, “มิจฉาชีพ”, or guilt findings in generated content.
- [ ] **Step 5: Verify the PDF export's existing direct-PDF and SFX choices remain intact.** Legal report integration changes PDF content only; SFX still wraps the PDF-only payload.

### Task 7: Benchmark, legal-review gate, and end-to-end acceptance

**Files:**
- Create: `_workspaces/phase7-header-20261003/digital-evidence/tests/fixtures/legal-triage/README.md`
- Create: `_workspaces/phase7-header-20261003/digital-evidence/tests/legal-triage-benchmark.test.mjs`
- Modify: `_workspaces/phase7-header-20261003/digital-evidence/PROJECT_STATUS.md` only if that app-local file exists; otherwise update root `PROJECT_STATUS.md` after execution.

- [ ] **Step 1: Assemble a consented, de-identified golden set.** A qualified reviewer labels event type, source page, route, each element state, contradiction, and expected missing evidence. Record dataset size and label provenance; do not use the current user's identifiable case as a benchmark without explicit permission.
- [ ] **Step 2: Measure each claim separately.** Report precision/recall for OCR fact extraction, CHAT-SLIP matching, module routing, and element-state classification. Include confusion matrices and per-module sample counts. Do not report the user's estimates as measured results.
- [ ] **Step 3: Add regression thresholds only after baseline measurement and review.** A module with inadequate labeled examples stays disabled/draft; no blanket accuracy percentage is inferred from a passing unit test.
- [ ] **Step 4: Run focused tests, `npx tsc --noEmit`, the relevant app build, and browser/PDF smoke tests.** Verify UI/PDF parity, unknown timestamps, no false fraud route from transfer alone, privacy masking, report provenance, and unchanged direct PDF/SFX delivery behavior.
- [ ] **Step 5: Obtain legal review and user approval of the rule corpus and report wording.** Record the corpus version and review date. If the legal review is unavailable, ship the feature explicitly as a technical, unverified research aid with candidate rules disabled or prominently marked draft.

## Acceptance Criteria

- All 13 specialist modules from the user's prompt have explicit mappings and test coverage; safeguards (privacy and electronic-evidence custody) are distinguished from offence provisions.
- Every candidate law and every matrix cell has traceable supporting/contradicting evidence IDs and source pages, or explicitly says `ข้อมูลไม่พอ`/`ต้องตรวจทาน`.
- A payment slip alone never produces an affirmative fraud element or a guilt statement.
- Conflicting records remain visible as `ขัดแย้ง`; no conflicting occurrence is silently removed.
- Event time/speaker/order is never invented; unknown timing is visibly labeled.
- The same `LegalTriageReport` drives the web UI and Master PDF.
- User-supplied performance estimates are not published as results until benchmarked on a labeled, de-identified corpus.
- No external LLM/network dependency is added without separate approval.
- Direct PDF export remains available; SFX remains available and contains only the PDF.

## Execution Handoff

This plan is intentionally sequential because the rule corpus, fact model, router, element evaluator, and UI/PDF depend on one another. Do not parallelize legal-rule authorship and engine implementation before the source/module reconciliation gate is complete.
