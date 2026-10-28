# Slip OCR Page 11/17 Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Keep this work single-agent as required by the project instructions.

**Goal:** Identify and expose, for the existing candidate on chat page 11/17, the first of six processing stages where the 8,000.00 amount and party names fail to reach the review UI, without inventing or confirming values.

**Architecture:** First inspect the existing target candidate's locally stored OCR evidence and reproduce from the exact source file. If that evidence cannot identify a stage, add a typed, in-memory diagnostic trace at the current local OCR pipeline, preserve it through candidate reconciliation, and render it in the existing review disclosure. Do not change extraction decisions in this task; use the trace to scope a later fix.

**Tech Stack:** Next.js 16 client UI, TypeScript, existing Tesseract.js OCR, existing QR/object crop utilities, Node.js built-in test runner. No new package or model.

## Global Constraints

- Preserve source pixels, SHA-256, source page mapping, candidate identity, and review/confirmation state.
- Keep original OCR text, retry OCR text, and context/parser decisions distinguishable.
- Never use a prior slip's name or amount to fill this candidate.
- Retries remain bounded; record every attempt and its trigger.
- Keep sensitive OCR diagnostics local to the existing review UI; do not add external logging or OCR providers.
- Do not modify extraction rules, matching semantics, or candidate confirmation behavior in this trace task.
- Report unit tests and UI end-to-end evidence as separate verification levels.

---

### Task 1: Capture the Existing Target Candidate Baseline

**Files:**
- Read: the exact original image/PDF that produced chat page 11/17; no substitute fixture for target acceptance
- Read: `digital-evidence/src/app/page.tsx` existing candidate details and OCR-evidence disclosure
- Read: `digital-evidence/src/types/embedded-slip.ts`

**Inputs:** The original source file used for the UI result showing page 11/17 and the 8,000.00-baht TTB slip. Do not proceed with a synthetic substitute if that original is unavailable.

- [ ] Identify the candidate by its source occurrence and bounds; confirm its chat page is 11/17.
- [ ] Open the existing OCR-evidence disclosure without confirming, editing, or selecting the candidate.
- [ ] Record locally whether the displayed raw OCR contains `8,000`, sender-name text, and recipient-name text; record any line bounds/classification and retry warnings shown.
- [ ] Compare those fields against the visible source crop and label the earliest currently provable failure stage. If existing data cannot distinguish OCR omission from parser omission, continue to Task 2 without declaring a root cause.

**Expected deliverable:** A baseline table for amount, sender name, and recipient name with source page/bounds, visible OCR text/evidence if present, UI value, and `unknown` where existing runtime evidence is insufficient.

---

### Task 2: Add a Typed Diagnostic Trace Contract

**Files:**
- Create: `digital-evidence/src/types/slip-ocr-trace.ts`
- Create: `digital-evidence/src/utils/slip-ocr-trace.mjs`
- Create: `digital-evidence/src/utils/slip-ocr-trace.d.mts`
- Modify: `digital-evidence/src/utils/local-qr-extractor.ts`
- Modify: `digital-evidence/src/types/embedded-slip.ts`
- Test: `digital-evidence/src/utils/__tests__/slip-ocr-trace.test.mjs`

**Interfaces:**
- `LocalSlipCandidate` and `EmbeddedSlipRecord` gain optional `ocrDiagnosticTrace?: SlipOcrDiagnosticTrace`.
- `SlipOcrDiagnosticTrace` contains source dimensions, detected object/QR bounds, selected crop bounds, attempt records, and per-field decisions. Bounds use source-image pixel coordinates; each attempt also stores the OCR input dimensions and scale.
- Each attempt has a stable `id`, `scope` (`qr_crop`, `full_page`, or `recipient_retry`), `trigger` (`initial`, `low_confidence`, `missing_fields`, or `recipient_missing`), mean confidence, and raw text lines with line IDs, confidence, and source-mapped bounds.
- Each field decision has the field name, `accepted|missing|conflict|rejected`, proposed value, evidence-line IDs, and a concrete reason code/text.
- `buildOcrAttemptTrace(input)` maps Tesseract line boxes from attempt coordinates into source-image coordinates and returns one immutable attempt record. `input` includes the attempt id/scope/trigger, source crop bounds, OCR input dimensions, scale, mean confidence, and raw lines.

- [ ] Write a failing coordinate-mapping test for `buildOcrAttemptTrace`: source crop `{x:100,y:50}`, scale `2`, and OCR line box `{x0:20,y0:30,x1:80,y1:50}` must map to source bounds `{x:110,y:65,width:30,height:10}` while preserving the original raw text/confidence and attempt ID.
- [ ] Run `node --test src/utils/__tests__/slip-ocr-trace.test.mjs` and confirm the coordinate assertion fails before implementation.
- [ ] Add the exported trace types, the typed declaration, and `buildOcrAttemptTrace` with the exact mapping above; leave parser decisions for Task 3.
- [ ] Run `node --test src/utils/__tests__/slip-ocr-trace.test.mjs` and confirm the new contract tests pass.
- [ ] Run `npx tsc --noEmit` to verify candidate and trace types.

**Expected result:** TypeScript candidate types can carry diagnostics end to end without changing current candidate values.

---

### Task 3: Capture Each Existing OCR Attempt and Parser Decision

**Files:**
- Modify: `digital-evidence/src/utils/local-slip-ocr.ts`
- Modify: `digital-evidence/src/utils/slip-ocr-analysis.ts`
- Test: `digital-evidence/src/utils/__tests__/slip-ocr-analysis.test.mjs`
- Test: `digital-evidence/src/utils/__tests__/ocr-enhancement-retry-policy.test.mjs`

**Interfaces:**
- Keep `extractSlipCandidatesWithLocalOcr(canvas, qrCandidates, workerSlot, options)` behavior and existing callers intact; add diagnostics to each returned `LocalSlipCandidate`.
- Record actual inputs for QR/object crop, full-page OCR, and focused recipient retry. Convert every OCR line bound back to source-image coordinates using the actual crop offset and scale used for that attempt.
- `SlipOcrRegion` reports a field decision for amount, sender name, recipient name, bank, reference, and date/time, tied to evidence-line IDs and the rule that accepted or rejected it.

- [ ] Write failing parser tests where the raw lines contain `8,000.00` and both party names but the resulting field is missing; assert the trace explains which rule rejected/omitted the field without changing the extraction result.
- [ ] Write failing retry-trace tests asserting original and retry attempts remain separately visible, retry count is bounded by the current policy, and a conflicting name is represented as `conflict` rather than overwritten silently.
- [ ] Run focused tests and confirm these assertions fail before implementation.
- [ ] Capture all OCR attempts already performed by `local-slip-ocr.ts`; retain their raw text/confidence and exact bounds, including attempts rejected by `evaluateEnhancedOcrRetry`.
- [ ] Add field-decision reason instrumentation alongside existing parsing branches. Do not infer missing text from bank template, another candidate, or participant history.
- [ ] Run `node --test src/utils/__tests__/slip-ocr-analysis.test.mjs src/utils/__tests__/ocr-enhancement-retry-policy.test.mjs src/utils/__tests__/slip-ocr-trace.test.mjs` and confirm pass.

**Expected result:** For each returned candidate, the trace explains what each OCR attempt saw and whether each target field was accepted, missing, conflicted, or rejected, while the extracted slip values remain unchanged from the pre-trace implementation.

---

### Task 4: Preserve Trace Through Reconciliation and Show It in Review UI

**Files:**
- Modify: `digital-evidence/src/utils/supplement-qr-candidates.ts`
- Modify: `digital-evidence/src/utils/finalize-slip-candidates.mjs`
- Modify: `digital-evidence/src/app/page.tsx`
- Test: `digital-evidence/src/utils/__tests__/finalize-slip-candidates.test.mjs`
- Test: `digital-evidence/src/utils/__tests__/reconcile-slip-ocr-candidates.test.mjs`

- [ ] Add a failing test proving same-region QR/OCR merge and duplicate consolidation preserve both attempt histories without changing the selected candidate's fields or creating a second candidate.
- [ ] Run the focused reconciliation tests and confirm the preservation assertion fails before implementation.
- [ ] Merge trace attempts by stable attempt ID when same-region evidence is combined; retain conflicting field decisions from both sources and identify the candidate source (`QR` or `OCR`).
- [ ] Pass `candidate.ocrDiagnosticTrace` into each `EmbeddedSlipRecord` in `page.tsx` without persisting it outside existing local state.
- [ ] Extend the existing `หลักฐาน OCR ของ candidate` disclosure with six compact stage statuses and a field-decision list. Each accepted/rejected value must link to its OCR line text, confidence, and source bounds; missing fields must show the actual recorded reason, not a generic “unclear” label.
- [ ] Ensure rendering the trace does not mutate review state, field values, confirmation, or ledger totals.
- [ ] Run `node --test src/utils/__tests__/finalize-slip-candidates.test.mjs src/utils/__tests__/reconcile-slip-ocr-candidates.test.mjs src/utils/__tests__/slip-ocr-trace.test.mjs` and confirm pass.

**Expected result:** Opening the candidate disclosure shows the trace associated with the same candidate and source page, including evidence for rejected and missing values.

---

### Task 5: Verify the Target Flow and Existing Controls

**Files:**
- Test: exact original source file containing page 11/17
- Verify: `digital-evidence/src/app/page.tsx` visible candidate details
- Run: focused utility tests listed below

- [ ] Reprocess the exact original source file through the UI on the running app; do not use a cropped attachment as a replacement for the chat-page input.
- [ ] Locate page 11/17 and open its candidate trace; verify candidate identity, source bounds, amount OCR attempts, both party-name attempts, parser decisions, and rendered fields agree with the recorded trace.
- [ ] Verify the 8,000.00 amount is shown only if supported by an OCR line from that source region; otherwise it remains missing/review-only with the exact failure reason.
- [ ] Verify sender and recipient names are shown only when supported by text from their respective source regions; do not borrow a name from another slip.
- [ ] Verify candidate count, source mapping, review status, confirmation status, and ledger total are unchanged by opening the trace.
- [ ] Run focused tests: `node --test src/utils/__tests__/slip-ocr-analysis.test.mjs src/utils/__tests__/ocr-enhancement-retry-policy.test.mjs src/utils/__tests__/slip-ocr-trace.test.mjs src/utils/__tests__/finalize-slip-candidates.test.mjs src/utils/__tests__/reconcile-slip-ocr-candidates.test.mjs`.
- [ ] Run `npx tsc --noEmit` from `digital-evidence`.
- [ ] Run one known-readable Krungthai control and one TTB control through the same UI flow; verify no new duplicate candidate and no field value is taken across source occurrences.

**Pass condition:** The exact page 11/17 runtime trace identifies the first divergent stage with source-linked evidence, and the UI displays that trace without changing extraction or review semantics. If the exact original source file is unavailable, report the trace task blocked at real-input verification; do not substitute synthetic success.

## Handoff Notes

- This plan is diagnostic only. Any parser, crop, retry-policy, model, or dependency change requires a follow-up scope based on the observed trace.
- YOLO, sliding-window slicing, PaddleOCR, VLMs, and external providers are not part of this plan.
- The user must review this plan before implementation begins.
