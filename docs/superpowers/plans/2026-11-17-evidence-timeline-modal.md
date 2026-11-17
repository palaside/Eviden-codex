# Evidence Timeline Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing table-first chat/slip linkage modal with a chronological evidence story that explains candidate links without asserting them.

**Architecture:** Keep the existing `linkageModalOpen` state, candidate generation, source lookup, review labels, and review-packet export in `src/app/page.tsx`. Change only the modal presentation: derive a sorted view model from existing candidates and ledger/chat source data, then render a safe rationale, timeline events, evidence previews, and explicit unavailable/status states. Do not mutate persisted candidate or ledger state.

**Tech Stack:** Next.js App Router, React, TypeScript/TSX, existing Tailwind-style utility classes and current evidence state in `src/app/page.tsx`.

## Global Constraints

- Preserve source evidence, provenance, candidate generation, review state, and confirmed-total semantics.
- Treat keyword overlap and time proximity only as review reasons; never infer intent or confirmed linkage.
- Do not invent confidence values or missing evidence.
- Preserve the existing review-packet export and its unconfirmed-candidate labeling.
- Keep card-driven filters out of this iteration.
- Read the relevant installed Next.js guide under `node_modules/next/dist/docs/` before editing application code.
- Do not add dependencies or change APIs, persistence schemas, Legal Signal behavior, OCR, or matching thresholds.

---

### Task 1: Build the existing-data Timeline view model in the page

**Files:**
- Modify: `src/app/page.tsx` near `chatSlipCorroborationCandidates` and the linkage modal.

**Interfaces:**
- Consumes: `chatSlipCorroborationCandidates`, each candidate's `chatPageNumber`, `chatSourceItemId`, `groupId`, `matchBasis`, `evidenceText`, `needsReview`, and optional time-proximity properties; `ledgerRecords`; `stagedQueue` chat pages and source files.
- Produces: a presentation-only sorted array with candidate, related ledger record, chat page/source/image, slip date/time, and per-side source-availability flags. It must not write to React state or IndexedDB.

- [ ] Read the relevant Next.js version guide and the exact candidate/ledger types used in `src/app/page.tsx` before editing.
- [ ] Derive one view entry per existing candidate. Resolve chat image by matching `chatSourceItemId` and `chatPageNumber` against `stagedQueue`; resolve slip by `candidate.slipId` against `ledgerRecords`.
- [ ] Sort entries by valid event timestamps; put entries with missing/invalid timestamps after dated entries and label them `เวลาไม่ระบุ`.
- [ ] Keep `matchBasis`/`evidenceText` as the sole source for rationale chips. Do not add keyword/date matching logic in the UI.

### Task 2: Replace the table-first modal body with the Timeline story

**Files:**
- Modify: `src/app/page.tsx`, existing modal block guarded by `linkageModalOpen`.

**Interfaces:**
- Consumes: sorted presentation entries from Task 1 and the existing candidate count/statistics/export handler.
- Produces: a responsive chronological story with traceable chat/slip evidence and status labels.

- [ ] Rename the modal heading to `Timeline · ลำดับเหตุการณ์และหลักฐานที่เกี่ยวข้อง` while retaining the existing close behavior.
- [ ] Add a concise introduction that states candidate links are suggestions for review and that keyword/time proximity do not establish a transaction relationship or intent.
- [ ] For each entry, render the chat event when available, a visible connector labeled with the current review state, and the slip event with available date/time, amount, reference, dossier page, and source name.
- [ ] Render only evidence-basis labels supported by the candidate's existing `matchBasis`/`evidenceText`; do not fabricate a numeric confidence score.
- [ ] Keep chat and slip source images in a side-by-side layout on wide screens and stacked on narrow screens. Preserve explicit placeholders when source images, pages, or OCR text are missing.
- [ ] Keep candidate, conflict, review-required, and human-reviewed labels distinguishable using existing state where available; do not add automatic confirmation or rejection actions.
- [ ] Preserve the existing processing-warning block, review-packet export button, print action, and close action.

### Task 3: Inspect the rendered modal and check the approved behavior

**Files:**
- No additional files unless a targeted rendering correction is required in `src/app/page.tsx`.

- [ ] Review the diff to confirm no matching logic, persistence, Legal Signal, totals, exports, or card filters changed.
- [ ] Run the project’s relevant static/build validation only after checking its configured script and required environment.
- [ ] Inspect the modal in the existing local staging UI with an available candidate and verify ordering, rationale wording, status, source previews, missing-source placeholders, and close behavior.
- [ ] Confirm the candidate remains unconfirmed and confirmed totals are unchanged before and after opening/closing the modal.
- [ ] Report any unavailable real-user-flow verification separately; do not label a build result as end-to-end success.

## Completion evidence

The feature is complete only when the existing linkage action opens a chronological story, each rationale is supported by candidate evidence, missing evidence is not guessed, review state and totals remain unchanged, and the existing export action remains available. Build/static validation and browser-flow observation must be reported as separate evidence levels.
