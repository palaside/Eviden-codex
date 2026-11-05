# CURRENT TASK 2 REPORT — Batch 500 Resumable Runner (2026-11-05)

This report replaces stale Task 2 reports from another plan. Its only authority is `.superpowers/sdd/task-2-brief.md` and Task 2 of `docs/superpowers/plans/2026-11-05-batch500-reboot-cleanup-audit.md`.

## Status

Implemented and focused checks passed. Acceptance is PARTIAL: the real 10-image pilot was deliberately stopped at the user's request after two completed images; the full 10-image pilot and browser resume proof are NOT complete. No full 500-image run occurred.

Workspace: `D:\Project\Digital Evi - Codex`.
Branch: `codex/task-1-contract` (the existing branch; no alternate workspace).
Base commit: `4db45831655d06775600b1ba8a51496d0742059d`.
The accompanying commit contains the Task 2 sources, tests, this report and the necessary two-line Task 1 integration hook described below. Generated evidence is retained locally and excluded from the commit.

## Implementation and acceptance mapping

- Created `scripts/run-batch500-resumable.mjs`, `scripts/run-batch500-resumable.ps1`, and `scripts/tests/run-batch500-resumable.test.mjs`.
- CLI supports `--base-url`, `--fixture-roots`, `--out-dir`, `--build-dir`, `--batch-spec`, `--resume`. Additional `--batch-id 001` selects only the pilot while preserving the complete seven-range manifest layout. Resume uses `--resume --out-dir <existing-run>`.
- Exact default layout: `001:0:10,002:10:50,003:60:100,004:160:100,005:260:100,006:360:100,007:460:40`. Rejects gaps, overlap, duplicate IDs, invalid counts, or coverage other than 500.
- Inventory reads direct PNG/JPEG files from the supplied approved roots, deduplicates overlapping absolute paths, sorts absolute paths by deterministic ordinal order, and selects the first 500. Fewer than 500 fails closed. This follows the full plan's instruction to limit inventory to exactly 500; it does not process every file under those roots. Each record includes absolute fixturePath, size, ISO modifiedTime, and source SHA-256.
- The four existing default roots contain 3,266 direct images. The selected manifest has exactly 500 records, representing 446 unique SHA values. Selection order and resulting SHA list are recorded in the immutable manifest. Duplicate source occurrences remain distinct inventory records.
- Uses the Task 1 manifest/checkpoint functions without modifying the contract module. CLI resume compares identity derived from current build ID, git commit, processing version, freshly hashed inventory and batch layout. runBatch also checks checkpoint compatibility and rehashes selected source files before skipping completed items.
- `runBatch({ manifestPath, batchId, offset, limit, runner })` invokes the injected browser adapter once per nonempty pending range, using the existing e2e browser runner and a fresh UUID output directory. Explicit pending fixture paths prevent offset drift on resume; offset/limit/base URL/build/executable environment remain available to the original runner.
- Each completed image is acknowledged over IPC only after its atomic checkpoint write. The child awaits this acknowledgement before continuing. Completion requires Task 1's processing-complete status plus a parseable trace containing the same source SHA. review_required stays independent of processing completion. Duplicate occurrences have skipped_duplicate records pointing to the completed original and preserve its review status.
- Batch start, per-image results, failure and completion are checkpointed. Fresh runs refuse existing run directories; every browser attempt has a fresh evidence directory. No prior trace/report directory is reused.
- Provider/quota failures are checkpointed and stop the child at the per-image barrier. A persisted stopReason blocks subsequent automatic resume; no automatic retry loop exists. Existing provider-blocking routes and OCR/browser assertions are unchanged.
- PowerShell checks service RUNNING, HTTP 200, local BUILD_ID, the build ID rendered in HTTP HTML, and git identity before each selected batch. It stops on mismatch. HTTP build extraction uses the current app's Next flight `b` field and fails closed when that field is unavailable.

## Necessary Task 1 integration exception

Modified `scripts/e2e-batch-local.mjs` by exactly two added lines after writePartialReport and page.close: an explanatory comment and an awaited optional `globalThis[Symbol.for("digital-evidence.batch-result")]?.(result)` hook.

Reason: the old runner writes a partial report but has no awaited notification/stop contract. Watching that file cannot guarantee checkpoint completion or provider/quota stop before the next upload. The integration-contract test failed before the hook was added. The new adapter installs it only in its browser child; standalone Task 1 behavior remains unchanged when the hook is absent. No OCR algorithm, browser assertion, provider configuration, dependency or Task 1 contract implementation was changed.

## TDD and focused verification

1. Initial RED: `node --test scripts/tests/run-batch500-resumable.test.mjs` failed with ERR_MODULE_NOT_FOUND for the missing runner, before implementation.
2. With implementation present, six behavioral tests passed and the awaited browser integration contract failed; only then was the minimal Task 1 hook added.
3. Additional regressions for changed completed-source bytes and accountable duplicate occurrences both failed before their corrections and subsequently passed.
4. Final focused/regression command: `node --test scripts/tests/run-batch500-resumable.test.mjs scripts/tests/batch500-contract.test.mjs` — **22 passed, 0 failed** (9 Task 2 tests + 13 Task 1 tests).
5. `node --check scripts/run-batch500-resumable.mjs` and PowerShell parser checks passed. Diff whitespace checks passed before commit.
6. Wrapper negative-path checks used scoped shell function stubs: stopped service, HTTP 503, and HTTP 200 with wrong rendered build all stopped before browser launch. These are simulations, not real service transitions.

The Windows sandbox initially denied atomic renames inside its redirected temporary folder. The existing Task 1 regression passed outside that restriction; final tests also passed with TEMP/TMP directed to the workspace's retained test-evidence folder. The contract was not weakened to accommodate the sandbox.

## Real browser pilot: partial, stopped safely

Command: `$env:E2E_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; ./scripts/run-batch500-resumable.ps1 -OutDir 'For Test Results/task2-pilot-20261105-current-01' -BatchId '001'`.

- Target: `http://127.0.0.1:3450/`; actual Windows service `digitalevidenceenterprise.exe` was RUNNING; HTTP returned 200.
- Local and HTTP-rendered build ID: `3ev1rjPH98s3lb5aLS_7A`.
- Pilot manifest git identity: base commit 4db45831655d06775600b1ba8a51496d0742059d, before this Task 2 commit.
- Runtime evidence directory: `For Test Results/task2-pilot-20261105-current-01/`.
- Browser evidence directory: `batch-001-c0737d24-f38f-404c-a2a7-1a576f8f14a5/` under that run directory.
- Two real inputs completed: `For Test/Done/A4_IMG_ (1).JPEG` and `For Test/Done/A4_IMG_ (1).PNG`. The unchanged runner exercised upload, processing, summary table and JSON trace export. Both records have processingStatus=completed and status=review_required. Their JSON traces parse and contain matching source SHA values.
- On the user's instruction to stop rather than wait indefinitely, only this pilot's browser worker was terminated after checking its parent command matched the pilot. The orchestration parent remained alive, captured child exit 4294967295, atomically wrote the failed batch state and exited. No service was stopped or restarted.
- Final checkpoint: 10 accountable records, 2 completed, 8 not_run, batch 001 failed due to intentional interruption. One of those eight may have been in progress when interrupted: not_run here does not prove no attempt or no local processing occurred. No complete trace for that interrupted item was claimed.
- `stopped-pilot-proof.json` records: completed=2, reviewRequired=2, completedTracesProven=2, uniqueCompletedSHA=2, completedWouldBeResent=0.
- Resume evidence has two levels: the focused test actually invokes runBatch a second time and proves zero runner calls for completed synthetic fixtures; the real checkpoint's pending calculation excludes both completed real SHA values. A second browser invocation on the real pilot was NOT run, since it would process remaining images after the user requested stopping. Do not label this a completed browser resume proof.
- The pilot used the earlier in-memory runner revision from its launch. Later focused corrections added source-rehash-before-skip and duplicate-accounting checks; those corrections passed focused tests but were not rerun through a new live browser pilot.

## Approval review and remaining concerns

Automatic approval review initially rejected the pilot because evidence or derivatives might be sent to an external provider. Before retrying, source inspection established that the existing browser runner aborts `/api/slips/extract` (Gemini), `/api/slips/slipvision`, and `/api/legal/tlex` before uploading; the Gemini action is a separate UI button that the runner never clicks, while local-slip-ocr uses browser Tesseract. The evidence-backed retry was approved and started. No provider or security setting was changed.

Remaining gaps / limits:

- The requested complete 10-image pilot and real browser resume proof remain incomplete by explicit user instruction; overall Task 2 E2E acceptance is partial.
- Full 500-image execution and batches 002–007 were not run, as required. No reboot, deployment, dependency, auth, database, Xerox skill or provider work was performed.
- Concurrent orchestration processes against one run directory are not supported or tested; use one wrapper at a time.
- The committed git identity differs from the pre-commit pilot manifest. Resuming that pilot after this commit must fail the git identity guard; start a fresh run for post-commit validation rather than editing its old manifest.
- No files were deliberately deleted, no original fixtures were changed, and previous evidence directories were preserved. Test fixtures/logs and pilot artifacts are untracked local evidence and are not included in the Task 2 commit.

## CURRENT TASK 2 REVIEW FIX — P1/P2 occurrence accounting (2026-11-05)

Scope: reviewer findings against `cffb926df0e8cb23c18466f2a06b37f17ba94633`, in the same repository and branch `codex/task-1-contract`. This section supersedes the original implementation's claims about complete duplicate accounting. Earlier pilot results remain historical evidence, not validation of this fix.

### Findings confirmed and changes

- P1 confirmed: accountDuplicates returned immediately whenever a fixturePath already had a checkpoint row. A not_run/failed duplicate therefore survived unchanged after another occurrence of its SHA completed, while getPendingFixtures considered the SHA complete.
- P2 confirmed: failure handling traversed SHA-deduplicated pending work. If the runner failed before producing a result, a second source occurrence could be absent from the saved checkpoint.
- Replaced that accounting loop with per-occurrence reconciliation, run before selecting SHA-deduplicated work and again after each result and on failure. Every selected inventory path receives a checkpoint row before the browser runner starts. Results replace the matching path in place.
- A duplicate without completion proof stays not_run (or retains its failed status) and points via duplicateOf to its selected representative. This link expresses equal source SHA only; it does not claim processing success, a usable trace, or confirmed evidence.
- Once a representative has processing-complete evidence and a parseable SHA-matching trace, existing not_run/failed duplicate rows become skipped_duplicate with duplicateOf, tracePath, build/processing identity and independent reviewStatus. Completion and review_required remain separate. Stale skipped_duplicate rows whose completion proof is unavailable return to not_run rather than remaining successful skips.
- Independent review_required is preserved from either occurrence's reviewStatus or status, including a representative whose processing status is completed while reviewStatus still requires review.
- Provider/quota detection, persisted stopReason and the no-automatic-resume guard were not changed. The existing provider/quota stop regression still passes.

Only `scripts/run-batch500-resumable.mjs`, `scripts/tests/run-batch500-resumable.test.mjs`, and this report changed in this fix. No further Task 1 change, wrapper behavior change, dependency, provider or Xerox skill work was required.

### Regression proof

New tests use retained synthetic fixture files, real manifest/checkpoint serialization and actual trace JSON files with an injected runner. They exercise runBatch input -> result callback/failure -> atomic on-disk checkpoint -> resume decision, rather than only an internal helper.

1. Two pre-existing not_run occurrences sharing one SHA: exactly one image is handed to the runner; at the per-image acknowledgement boundary, both paths are saved, the representative is completed/review_required, and the other is skipped_duplicate with matching duplicateOf/tracePath and reviewStatus=review_required. Batch completes; an intentional second runBatch call makes no runner call.
2. The same scenario with two pre-existing failed occurrences checks identical reconciliation and resume behavior.
3. Runner throws before its first result: the failure checkpoint contains both inventory paths, both remain not_run, the second explicitly links to the first with duplicateOf, and no successful trace or skipped completion is invented.
4. A representative with status=completed and independent reviewStatus=review_required propagates review_required to its duplicate.

RED: after correcting the new fixture helper to use the recomputed manifest identity, the first three regressions failed with not_run/failed instead of skipped_duplicate, and one occurrence instead of two. The independent reviewStatus regression separately failed with completed instead of review_required before its correction.

Final checks:

- `node --test scripts/tests/run-batch500-resumable.test.mjs`: **13 passed, 0 failed**.
- `node --test scripts/tests/batch500-contract.test.mjs`: **13 passed, 0 failed**. TEMP/TMP pointed to the workspace's retained test-evidence directory to avoid the previously documented Windows sandbox temporary-folder rename restriction.
- `node --check scripts/run-batch500-resumable.mjs` and `node --check scripts/tests/run-batch500-resumable.test.mjs`: passed.
- PowerShell parser check for `scripts/run-batch500-resumable.ps1`: passed; wrapper unchanged.
- `git diff --check`: passed before staging; staged whitespace and file-scope checks are part of the fix commit preparation.

### Current status and limits

P1/P2 are addressed with failing-before/passing-after regression evidence at the orchestration/checkpoint level. These tests are simulations of browser result delivery; they are not a new live browser E2E result. No fresh 10-image pilot was needed to reproduce these deterministic checkpoint defects and none was run. No full 500-image batch was run. The original complete 10-image pilot and live browser resume proof remain incomplete, as reported above; this fix does not change that overall E2E limitation. Existing fixture files and old pilot evidence were not modified or deleted.
