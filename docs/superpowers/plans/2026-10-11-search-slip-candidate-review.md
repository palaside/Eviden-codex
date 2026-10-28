# Search Slip Candidate Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Search Slip OCR candidates visible beside PDF review/export, improve evidence-linked party extraction, and preserve every detected page occurrence for human review.

**Architecture:** Keep the existing Next.js -> API route -> Python CLI scan flow and its review-only response. Improve Python parsing and occurrence metadata, then render the returned candidates in the PDF export/review context instead of making SFX modal visibility a prerequisite. Preserve raw OCR and never infer missing data.

**Tech Stack:** Next.js 16, React 19, TypeScript, Python, OpenCV, pytesseract, PyMuPDF, Python `unittest`, Node.js built-in test runner.

## Global Constraints

- Candidate OCR data remains review-only and is not transaction/authenticity confirmation.
- Candidate values do not contribute to reconciled financial totals.
- Raw OCR text and page provenance remain available for review.
- Every detected PDF page remains a distinct occurrence even when Ref repeats or is missing.
- Do not infer names from account suffixes or invent unreadable account digits.
- Do not add dependencies or change persistent storage/export format/API semantics.
- Do not commit changes unless the user explicitly requests a commit.

---

## File Map

- `skills/Search_Slip/scripts/search_slip.py`: OCR parsing, party fields, occurrence identity, repeat-Ref annotation, and candidate provenance.
- `skills/Search_Slip/scripts/test_search_slip.py`: deterministic OCR/parser and PDF page-occurrence regression tests.
- `digital-evidence/src/app/page.tsx`: candidate state lifecycle and rendering in the PDF export/review context; keep SFX unrelated to visibility.
- `digital-evidence/src/utils/search-slip-review-state.ts`: deterministic candidate/zero-result/error status messages used by the PDF export lifecycle.
- `digital-evidence/src/utils/target-matcher.ts`: pure derivation of OCR-detected targets while preserving manual entries and selection.
- `digital-evidence/src/app/api/export/search-slips/route.ts`: preserve the existing API shape and review-only semantics; change only if implementation uncovers a concrete contract defect.
- `digital-evidence/src/app` or existing test location: add a focused route/UI contract test only if the existing test harness supports it without new dependencies.

## Task 1: Label-Linked Party Extraction

**Files:**
- Modify: `skills/Search_Slip/scripts/search_slip.py`
- Test: `skills/Search_Slip/scripts/test_search_slip.py`

**Interfaces:**
- Consumes: OCR `raw_text` returned by `extract_slip_details_ocr`.
- Produces: existing `sender`, `receiver`, `sender_acc`, `receiver_acc`, and `raw_text` fields, with conservative label-linked parsing; do not change the existing JSON field names.

- [x] **Step 1: Add a failing positive test for label-linked names**

Add a test to `TestSearchSlip` that patches `search_slip.pytesseract.image_to_string` with:

```text
จาก
กรุงไทย
นาย สมชาย ใจดี
XXX-X-XX123-4
ไปยัง
น.ส. สมหญิง รักดี
ไทยพาณิชย์
XXX-X-XX567-8
จำนวนเงิน 5,000.00 บาท
```

Assert `sender` contains `สมชาย ใจดี`, `receiver` contains `สมหญิง รักดี`, the account fields contain only the two OCR-provided masked values, and `raw_text` is unchanged. Run:

```powershell
python -m unittest skills.Search_Slip.scripts.test_search_slip.TestSearchSlip.test_extracts_label_linked_names_from_ocr -v
```

Expected: FAIL until the fixture test is added and parser behavior meets the assertions.

- [x] **Step 2: Add negative tests for unrelated or ambiguous names**

Cover a sender/receiver label followed by a bank name and masked account but no person name; assert that bank labels and account text do not become a name. Cover an unrelated chat-like sentence containing a person's name away from the party labels; assert it is not promoted. Keep the existing account-suffix regression test.

- [x] **Step 3: Run the focused parser tests and confirm the new cases fail for the intended reason**

Run:

```powershell
python -m unittest skills.Search_Slip.scripts.test_search_slip.TestSearchSlip -v
```

Expected: only the newly specified positive case fails before implementation; existing regressions remain unchanged.

- [x] **Step 4: Implement the smallest label-linked parser adjustment**

Update `extract_names_from_slip_text` and adjacent OCR cleanup only as needed. Keep recognized honorific normalization separate from the original `raw_text`; limit name candidates to nearby lines between the sender and receiver cues, or immediately after each cue. Reject known bank labels, account labels, dates, amounts, and masked-account strings. Do not add account-to-person mappings or infer unmasked digits.

- [x] **Step 5: Re-run the Python tests**

Run:

```powershell
python -m unittest skills.Search_Slip.scripts.test_search_slip.TestSearchSlip -v
```

Expected: all parser tests pass, including the existing regression for account suffixes not creating names.

## Task 2: Preserve Per-Page Occurrences and Provenance

**Files:**
- Modify: `skills/Search_Slip/scripts/search_slip.py`
- Test: `skills/Search_Slip/scripts/test_search_slip.py`

**Interfaces:**
- Consumes: one OCR result per detected page.
- Produces: one candidate per detected page, with stable `occurrence_id`, page list, `repeated_ref`, own raw OCR, parsed fields, and review status; retain current CLI JSON envelope `{ "results": [...] }`.

- [x] **Step 1: Add a test for separate detections with missing Ref**

Create a two-page temporary PDF; patch detection to return a slip on both pages and OCR to return no Ref with distinct `raw_text` values. Assert two rows remain, `occurrence_id` values are `pdf-page-1` and `pdf-page-2`, each row has only its own page, and neither occurrence is discarded because Ref is empty.

- [x] **Step 2: Strengthen the repeated-Ref test to verify provenance per occurrence**

Extend `test_preserves_each_page_occurrence_when_transaction_reference_repeats` to assert each result retains its own `raw_text`, page, and extracted data, the second same-Ref row is marked repeated, and the JSON output retains both entries. Keep its spreadsheet review-status assertion.

- [x] **Step 3: Run the occurrence tests and verify per-page results**

Run:

```powershell
python -m unittest skills.Search_Slip.scripts.test_search_slip.TestSearchSlip.test_preserves_each_page_occurrence_when_transaction_reference_repeats skills.Search_Slip.scripts.test_search_slip.TestSearchSlip.test_preserves_each_page_occurrence_when_reference_is_missing -v
```

Expected: one row per detected page with independent provenance.

- [x] **Step 4: Keep existing per-page occurrence metadata; tests showed no production gap**

Keep the current page-based occurrence identity and repeat-Ref review annotation. Do not deduplicate by Ref, amount, or date/time. Preserve raw OCR and existing output field names.

- [x] **Step 5: Run all Search Slip Python tests**

Run:

```powershell
python -m unittest skills.Search_Slip.scripts.test_search_slip -v
```

Expected: tests pass; the corpus test may skip if `Folder_Out/Evidence_Chat_V1.pdf` is absent, and that skip must be reported.

## Task 3: Render Candidates in PDF Review Context

**Files:**
- Modify: `digital-evidence/src/app/page.tsx`
- Test: existing Node UI/helper test harness if applicable; otherwise use the approved browser UI flow after static checks.

**Interfaces:**
- Consumes: current `searchSlipScanCandidates` and PDF scan/export status.
- Produces: visible PDF candidate review content associated with the current PDF export. Candidate count, fields, and review-only semantics remain the same; SFX is not required to view the scan result.

- [x] **Step 1: Identify the PDF export/review JSX boundary and available test harness**

No React rendering harness is configured in the app. The browser flow in Step 5 verifies the visible location without adding dependencies.

- [x] **Step 2: Establish the pre-change behavior from the current implementation**

Before implementation, the candidate JSX was nested in the SFX modal.

- [x] **Step 3: Move or share the candidate-review section into the PDF export/review context**

Render page, amount, date/time, bank, Ref, sender, receiver, repeated-Ref warning, review status, and a readable raw-OCR disclosure. Preserve empty/missing values as “ไม่พบ/รอตรวจทาน”. Do not place candidate amounts into reconciled totals or replace the separate 13-column financial summary.

Tie results to the current export lifecycle: clear stale results when a new PDF export begins; distinguish scan error, completed scan with zero candidates, and completed scan with candidates. Do not require opening SFX to inspect any of these states.

- [x] **Step 4: Run focused static and automated checks**

Run from `digital-evidence`:

```powershell
npx tsc --noEmit
node --test src/utils/__tests__/*.test.mjs
```

Latest rerun after resolving the target-list synchronization lint failure and covering scan-status branches: `npx tsc --noEmit` passed; `node --test` passed 418/418; focused target-matcher tests passed 9/9; focused scan-status tests passed 3/3; `npx eslint src/app/page.tsx src/utils/target-matcher.ts src/utils/search-slip-review-state.ts` exited 0 with 8 warnings and no errors. Remaining warnings are unused symbols, pre-existing effect/memo dependencies, and `<img>` usage.

- [x] **Step 5: Verify the real UI flow in the active app**

Exported and scanned the active local `chatv3` evidence PDF. Candidate details appeared in the PDF export context without opening SFX; the page-6 candidate showed sender/receiver text from OCR and exposed raw OCR; financial totals remained ฿0.00. This verifies the actual UI-to-API-to-Python flow for current local evidence, not a deterministic seeded fixture. Zero-result and scan-error states are implemented but were not separately exercised in the browser.

After replacing the target-list sync effect with derived data, inspected the active `http://localhost:3445/` page: the staged chatv3 candidate list and target list rendered; confirmed transaction count remained 0 and totals remained ฿0.00. This was an inspection of existing UI state, not a newly triggered OCR/export scan. Success-with-candidates was visible; zero-result and failure status messages are covered at the pure-helper level, but those two states were not induced in the live UI.

## Task 4: End-to-End Regression and Review

**Files:**
- No new files unless a focused failing test requires them.

- [x] **Step 1: Run the Search Slip Python suite**

```powershell
python -m unittest skills.Search_Slip.scripts.test_search_slip -v
```

Latest result: 17 tests run, 16 passed, 1 skipped because `Folder_Out/Evidence_Chat_V1.pdf` is not present. `TEMP`/`TMP` were scoped to `.tmp/search-slip-tests` so the Windows runner could create temporary PDFs.

- [x] **Step 2: Run the application TypeScript and Node test suites**

From `digital-evidence`:

```powershell
npx tsc --noEmit
node --test src/**/*.test.mjs tests/**/*.test.mjs
```

Latest exact commands: `npx tsc --noEmit` passed; `node --test` passed 418/418. The focused target matcher file passed 9/9 and scan-status file passed 3/3. `npx eslint src/app/page.tsx src/utils/target-matcher.ts src/utils/search-slip-review-state.ts` exited 0 with eight warnings and no errors.

- [x] **Step 3: Inspect the focused diff for data semantics and regressions**

Confirm no dependencies, persistent schemas, API field names, financial totals, or unrelated UI regions changed. Confirm every candidate remains labeled for human review and every PDF page occurrence remains distinct.

- [x] **Step 4: Report evidence and gaps**

Report changed files, test commands/results, whether the UI flow and real fixture ran, any skipped corpus test, remaining lint warnings, and unresolved OCR cases. Do not claim a field is accurate for real slips based only on synthetic OCR unit tests.

## Plan Self-Review

- Spec requirements are covered: PDF-context visibility (Task 3), label-linked extraction/no guessing (Task 1), raw OCR and provenance (Tasks 1-2), repeated and missing Ref occurrence behavior (Task 2), review-only/API semantics (Tasks 2-4), UI/static/integration verification (Tasks 3-4).
- No dependency, storage schema, export format, or financial-total changes are planned.
- No commit steps are included because the project instructions prohibit committing without explicit user request.
