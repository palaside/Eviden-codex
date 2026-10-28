# Slip OCR Six-Stage Diagnostics Design

Date: 2026-10-17
Status: Design for user review
Scope: Diagnose the existing slip candidate on chat page 11/17, where the visible TTB slip shows an 8,000.00-baht transfer but the candidate result does not show that amount or the sender/recipient names.

## Goal

Make an existing slip candidate explainable across the image-to-UI path. For each expected field, determine whether evidence was lost during image preparation, region detection, OCR recognition, contextual parsing, or candidate/UI mapping. Preserve uncertainty: never fill a name or amount from another slip or infer a value that is not supported by this slip's evidence.

## Current Evidence and Unknowns

- The user identifies the target as chat page 11/17 and confirms a candidate exists.
- The supplied TTB slip image visibly contains a transfer amount of 8,000.00, sender and recipient blocks, and a QR code near the lower-right area.
- The UI screenshot shows unresolved slip candidates, but it does not expose the runtime trace for the exact page 11/17 candidate.
- Current code performs QR/object-crop OCR when QR candidates exist and also OCRs the full page. It uses OCR text, line bounds, QR anchors, labels, and positional rules to build slip fields.
- The UI can show candidate OCR text and line provenance when available. The current evidence does not establish whether the target amount/name text was recognized, rejected by parsing, mapped to another candidate, or omitted at render time.
- No root cause is assigned until the target candidate's actual runtime evidence is inspected.

## Diagnostic Model: Six Stages

### 1. PIXELS

Record source identity, SHA-256, decoded dimensions, orientation, page index, and pixel format. Preserve the original image as immutable evidence. The target candidate must remain linked to chat page 11/17 and its source file.

### 2. PREPROCESS

Record each image variant actually sent downstream: operation names, scale, crop bounds, and source-coordinate transform. Do not replace the original. Do not claim preprocessing improved readability without comparing the resulting OCR evidence.

### 3. DETECT

Record detected slip/object and QR bounds, detection source, selected OCR crop bounds, and the mapping from crop coordinates back to the original page. This stage answers whether the candidate's OCR image includes the 8,000 amount and both party-name regions.

### 4. RECOGNIZE

Retain raw OCR lines for the original and each bounded retry, including engine/configuration, confidence, and bounding boxes. Keep separate results per pass; do not silently overwrite a conflicting OCR reading. Confidence is a recognizer score, not proof that the text is correct.

### 5. CONTEXT

For each field (amount, sender name, recipient name, bank, reference, date/time), record candidate text, evidence-line identifiers, spatial/label rules used, and an explicit decision reason for accepted, rejected, conflicting, or missing values. Context-derived suggestions must remain separate from OCR transcription and must never be presented as source text.

### 6. STRUCTURE

Trace accepted field values into the candidate, review/ledger record, and visible UI. Record candidate identity, source page/region, deduplication outcome, review status, and the UI value rendered. This stage determines whether correct parsed data was lost during state mapping or display.

## Runtime Trace Requirements

- Inspect only the target candidate and its linked page/region first; avoid processing unrelated pages during diagnosis.
- Trace QR-crop OCR and full-page OCR separately, then show how reconciliation selected or rejected each field.
- Make retries bounded and deterministic. Record attempt count and the reason each retry was triggered or accepted; do not add an unbounded retry loop.
- Keep sensitive OCR text and names in the existing local review surface only. Do not send them to external logging or a new provider as part of this diagnostic design.
- Do not change source images, candidate confirmation, user review state, or ledger values while collecting the trace.

## Approaches Considered

1. Trace the existing candidate through all six stages before changing extraction logic. Recommended because a candidate already exists and the observed failure can be localized without adding dependencies or guessing.
2. Add a TTB-specific layout profile immediately. Deferred until the trace shows that the existing OCR lines contain the relevant evidence but current geometric/label parsing rejects or misassigns it.
3. Add sliding-window slicing and a YOLO slip detector. Deferred until evidence shows that long-page region detection or crop boundaries are the failure. This option requires labeled examples, model/dependency decisions, and validation; the supplied note's claims of universal or 100% success are not accepted as acceptance evidence.

## Acceptance Criteria for the Target Case

- The trace identifies the exact candidate and source occurrence on chat page 11/17.
- For amount 8,000.00, the result is either (a) mapped to the exact OCR line and source bounds that support it, or (b) explicitly marked unreadable/missing with the evidence showing why. A different amount must not be substituted without evidence.
- Sender and recipient names are each mapped only to text recognized from their respective party regions. If recognition is missing or conflicting, the field remains pending review and exposes the supporting raw OCR attempts.
- The trace shows which of the six stages first diverges from the expected result; no root cause is declared from the source screenshot alone.
- Existing candidate identity, source provenance, manual review state, and confirmation gates remain unchanged during diagnosis.
- After a later approved fix, rerun the target flow and focused regression cases for QR-anchored standalone slips and embedded chat slips. Report UI-visible results separately from unit tests.

## Out of Scope

- Training or integrating YOLO, PaddleOCR, a VLM, or another external OCR provider.
- Adding dependencies or model files.
- Changing candidate matching, auto-confirmation, or user review semantics.
- Claiming OCR accuracy from a single screenshot or using participant history to fill missing fields.

## Next Step

User reviews this design. After approval, create a focused implementation plan for the read-only runtime trace and target-case verification. Any extraction-logic change must be based on the trace and separately scoped to its demonstrated failure stage.
