# Search Slip Candidate Review Design

Date: 2026-10-11
Status: Approved and implemented; verification details are recorded in the implementation plan

## Problem

Search Slip scans the generated PDF and returns review-only visual slip candidates. The UI currently keeps the scan result in application state but renders candidate details inside the SFX modal, which separates the findings from the PDF the user is reviewing. OCR-derived sender/receiver fields may also be missing or inaccurate, and repeated transaction references must not cause distinct PDF-page occurrences to be merged.

## Goals

- Show PDF scan candidates in the PDF export/review context where the user can inspect the corresponding PDF.
- Improve label-linked sender and receiver extraction using OCR text already produced by Search Slip.
- Preserve account text only when OCR provides it; never infer or fabricate masked account digits.
- Preserve each detected PDF page as a distinct occurrence even when its transaction Ref repeats.
- Keep every scan result explicitly review-only; do not silently promote OCR output into confirmed financial records or totals.
- Keep raw OCR text and page provenance available for human review.

## Non-goals

- Changing the financial summary's 13-column schema or its meaning.
- Automatically validating slip authenticity, payment completion, or transaction identity.
- Using account suffixes to infer a person's name.
- Adding dependencies, changing persistent storage/schema, or altering export formats.
- Replacing the existing OCR engine or slip detector without evidence that this is required.

## Proposed behavior

### PDF candidate visibility

After PDF export and scan complete, render the candidate list in the PDF export/review area, associated with the current exported PDF and scan status. Do not require opening the SFX modal to inspect the findings. Each row should expose the PDF page, amount, date/time, bank, Ref, sender, receiver, and review state where available. Missing or uncertain values remain visibly unavailable/under review. Include the raw OCR text in a review affordance so users can compare extracted fields with source text. Candidate results remain separate from the 13-column financial summary.

The UI must communicate that visual/OCR candidates are not confirmed transactions and are not included in financial totals. Existing scan failures should remain distinguishable from a successful scan with zero candidates.

### Name and account extraction

Use label-aware parsing around sender/receiver cues, including nearby OCR lines and known Thai honorific variants. Avoid promoting bank labels, account labels, ordinary sentences, or unrelated names into parties. Preserve the raw OCR string. Do not fabricate names or account digits when the evidence is absent or ambiguous; mark the field for review instead.

Any normalization (for example, stripping a recognized honorific) must not discard the raw OCR value. The structured field should be derived from a local, label-linked OCR span, not from a hardcoded account-to-name mapping.

### Occurrence handling

Every detected PDF page is a separate occurrence with a stable page-based occurrence identifier. A repeated Ref is a relationship/review flag, not a deduplication instruction. Repeated-Ref candidates remain separately visible and retain their own page number, OCR text, and extracted fields. Ref absence must not collapse separate occurrences either.

## Data flow

1. Next.js exports the PDF and invokes the Search Slip API for that PDF.
2. The API writes a temporary PDF, invokes `skills/Search_Slip/scripts/search_slip.py`, reads its JSON result, and returns review-only candidates.
3. The UI associates the returned candidates and scan status with the current PDF export and renders them in the PDF review/export context.
4. Python rasterizes each PDF page, detects candidate slip regions, OCRs the crop, parses labeled fields, and emits one result per detected page with provenance and review status.

## Scope candidates for implementation

- `digital-evidence/src/app/page.tsx`: candidate state lifecycle and PDF-context rendering; remove dependence on the SFX modal for visibility.
- `digital-evidence/src/app/api/export/search-slips/route.ts`: preserve and validate the review-only API contract and candidate response shape.
- `skills/Search_Slip/scripts/search_slip.py`: label-linked name/account parsing, per-page occurrence identity, repeated-Ref annotation, and raw OCR/provenance retention.
- Focused tests for the Python parser/pipeline, API contract, and UI rendering/state behavior.

Final file-level edits should follow repository conventions discovered during implementation; this list is an initial scoped map, not authorization to alter unrelated modules.

## Safety and integrity constraints

- Keep raw evidence and SHA-256/export integrity handling unchanged.
- Do not treat OCR confidence or a parsed Ref as proof of transaction authenticity.
- Do not add candidate amounts to the reconciled total.
- Do not replace missing data with guessed values.
- Do not merge occurrences solely because Ref, amount, or date/time match.
- No dependency changes, storage schema changes, or export-format changes are included.

## Verification plan

1. Unit tests for Thai sender/receiver labels, names on adjacent lines, honorific variants, OCR noise, missing names, masked/unreadable accounts, and unrelated text that must not be promoted.
2. Pipeline tests proving distinct pages remain distinct when Ref repeats or is missing, with repeat flags and raw OCR preserved.
3. API tests validating the response shape, review-only semantics, and candidate count.
4. UI tests proving candidates appear in the PDF review/export context without opening SFX; zero-result and scan-error states remain distinguishable; repeated occurrences are separately shown.
5. TypeScript/static checks and the existing focused Python and Node test suites.
6. UI flow test against a deterministic test PDF/image fixture when available. If no suitable local corpus/fixture exists, report that limitation explicitly rather than claiming real-evidence validation.

## Risks and mitigations

- OCR layout variation can cause false party extraction. Mitigate with label distance/line rules, negative tests, raw OCR display, and review-only status.
- Repeated Ref can represent duplicate evidence or distinct appearances of the same transfer. Preserve both occurrences and flag for human review rather than choosing automatically.
- Candidate state can become detached from a later export. Associate scan results with the current export lifecycle and clear/replace them when a new PDF export begins.
- The large 13-column financial table may not be appropriate for a compact export panel. Keep candidate review as a separate list/table and avoid changing the financial summary contract.

## Acceptance criteria

- A successful PDF scan displays its candidate details in the PDF review/export context without opening SFX.
- Each detected page remains independently inspectable, including repeated-Ref pages.
- Sender/receiver names and account values are populated only from label-linked OCR evidence; unreadable values remain explicitly unavailable/reviewable.
- Raw OCR/page provenance can be inspected alongside parsed values.
- Candidate scan results remain review-only and do not affect reconciled financial totals.
- Relevant automated tests and the available UI flow checks pass, with any untested real-corpus conditions reported.
