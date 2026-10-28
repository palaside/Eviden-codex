# Consistent Review Packet Implementation Plan

> **For agentic workers:** Follow this plan task by task with TDD; preserve all user evidence and existing exports.

**Goal:** Export app-generated chat/slip corroboration candidates as a separate, traceable review packet.

**Architecture:** Add an isolated endpoint and ReportLab builder; input pairs contain app-rendered A4 chat/slip images, source identifiers, match basis and financial fields. The output labels every pair as pending human review, includes image SHA-256 values and a separate 10-column summary table, and never mutates the ledger or existing Master PDF.

**Tech Stack:** Next.js route handler, existing Python/ReportLab export stack, Node tests, pytest.

## Global Constraints

- Do not add dependencies or change existing export formats.
- Do not mark any pair as confirmed or use it to alter totals.
- Validate payload size, image data URLs, row shape, and output password with the existing export conventions.
- Test with synthetic fixture images; do not process or mutate the user's persisted case.

### Task 1: Payload contract

**Files:** create `src/utils/consistent-review-packet.mjs` and its Node test; test candidate-to-page/source resolution, summary row mapping, and missing-source rejection.

- [ ] Write failing payload-builder tests.
- [ ] Implement the minimal pure builder and pass targeted tests.

### Task 2: PDF builder and route

**Files:** create `scripts/consistent_review_packet_pdf_export.py`, pytest coverage, `src/app/api/export/consistent-review-packet/route.ts`, and exporter invocation in `src/lib/server/export-process.ts`.

- [ ] Test page count, paired-image presence, 10-column summary, review-only disclaimer, source SHA-256 and password protection.
- [ ] Add bounded payload validation and isolated temporary-file cleanup.

### Task 3: UI action

**Files:** modify `src/app/page.tsx` to build the packet from existing review candidates and provide a separate download action/status.

- [ ] Keep the action disabled when there are no candidate pairs.
- [ ] Label output as a review packet, not a confirmed or court-validated match.

### Task 4: Verification and audit

- [ ] Run targeted tests, full Node and Python suites, TypeScript, relevant ESLint and production build.
- [ ] Verify the route with synthetic data and inspect a rendered PDF.
- [ ] Perform UI verification only on an isolated test origin with known-empty state; otherwise record the exact limitation and do not mutate user queues.
- [ ] Update skill checklist/audit with the tested scope and remaining gaps.
