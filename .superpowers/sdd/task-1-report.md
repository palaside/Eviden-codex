# Task 1 Implementation Report — Dual-stream artifact manifest contract

## Status

Implemented and committed. No unrelated dirty files were staged or changed by this task.

## Changed files

- `src/utils/dual-stream-enhancement.mjs` — added pure manifest, artifact provenance, detection-gate, and variant-plan contract utilities.
- `src/utils/dual-stream-enhancement.test.mjs` — added focused contract tests.

`src/types/slip-ocr-trace.ts` was not modified because the new contract has no dependency on the existing OCR trace types.

## Commit hash

`122f32f771abc613c8f240ee2fcf0c1a3805cbe0` — `feat: add dual-stream enhancement manifest contract`

## Tests and commands

1. RED phase: `node --test src/utils/dual-stream-enhancement.test.mjs`
   - Failed as expected before implementation with `ERR_MODULE_NOT_FOUND` for `dual-stream-enhancement.mjs`.
2. Focused GREEN phase: `node --test src/utils/dual-stream-enhancement.test.mjs`
   - Passed: 6 tests, 0 failures.
3. Regression: `node --test src/utils/dual-stream-enhancement.test.mjs src/utils/__tests__/slip-ocr-trace.test.mjs`
   - Passed: 8 tests, 0 failures.
   - The brief's path `src/utils/slip-ocr-trace.test.mjs` does not exist in this checkout; the existing test is `src/utils/__tests__/slip-ocr-trace.test.mjs` and was run instead.
4. `git diff --check HEAD^ HEAD -- src/utils/dual-stream-enhancement.mjs src/utils/dual-stream-enhancement.test.mjs`
   - Passed with no whitespace errors.
5. `git status --short -- src/utils/dual-stream-enhancement.mjs src/utils/dual-stream-enhancement.test.mjs`
   - No output after commit; both task files are clean.

## Concerns

- This task implements only the pure contract. It does not generate image variants, detect slips, create crop artifacts, call OCR/Gemini/QR, or connect state to the Canvas. Those remain subsequent plan tasks.
- Artifact records validate their metadata and source/derived role but do not read or write files; filesystem existence and hash computation belong to later pipeline stages.
- Initial manifest detection is `fail` for the default expected count of 2 because no detections have been recorded yet. Detection evaluation is count equality only, as specified.

---

# Task 1 Review Fix Report

## Status

All Critical/Important findings and the requested Minor contract/test gaps were addressed in the two Task 1 implementation files. The contract remains pure and dependency-free.

## Changes

- Defined canonical logical artifact IDs: original references use `source/<lowercase-sha256>` and generated artifacts use `derived/stream-a/...` or `derived/stream-b/...`.
- Rejected noncanonical relative, traversal, absolute, drive-letter, backslash, and uppercase path spellings. Logical IDs are not filesystem paths; a downstream writer must still resolve and compare physical destinations against the source before writing.
- Required crop records to include finite source-coordinate bounds with nonnegative `x`/`y` and positive width/height. No source upper-bound check is performed here.
- Required crop variants to point to the canonical `crop-original` artifact for the same Stream B slip.
- Required derived transforms to include a nonempty engine and nonempty operations; upscale operations also require a finite scale greater than 1. Original references explicitly require `{ engine: "none", operations: [] }` and source identity.
- Added rejection and mutation-isolation coverage. No blanket source/derived hash inequality rule was added.

## Tests and exact commands/output

RED check after adding the new regression tests, before completing the contract fixes:

```text
node --test src/utils/dual-stream-enhancement.test.mjs
tests 12, pass 6, fail 6
```

The expected failures reproduced the missing canonical-path, crop-bounds/provenance, and transform validation behavior. One additional happy-path fixture mismatch was corrected to use the newly specified logical IDs.

Final focused run:

```text
node --test src/utils/dual-stream-enhancement.test.mjs
tests 13, pass 13, fail 0
```

Final regression run:

```text
node --test src/utils/dual-stream-enhancement.test.mjs src/utils/__tests__/slip-ocr-trace.test.mjs
tests 15, pass 15, fail 0
```

Whitespace validation:

```text
git diff --check -- src/utils/dual-stream-enhancement.mjs src/utils/dual-stream-enhancement.test.mjs
exit code 0; no whitespace errors
```

## Concerns

- This contract defines logical IDs only. Any filesystem writer added by later tasks must independently resolve source and output destinations and reject identical resolved destinations.
- Source upper-bound bbox validation remains intentionally deferred until the stage has source dimensions.
- Equal SHA-256 values remain valid for derived artifacts; the contract does not assume every transform changes pixel bytes.

---

# Task 1 — Batch run manifest and checkpoint contract (2026-11-05)

This section is the current report for `.superpowers/sdd/task-1-brief.md`.
The pre-existing dual-stream report above was retained verbatim as prior evidence.

## Status and scope

DONE_WITH_CONCERNS. Implemented Task 1 only on branch `codex/task-1-contract`.
Implementation commit: `4c3f9a9f86eb4af4cfecf25cc5e808510e0760ef`
(`test: define resumable batch checkpoint contract`).
A separate documentation commit adds this report, avoiding an impossible self-referential commit hash.

Read the entire plan `docs/superpowers/plans/2026-11-05-batch500-reboot-cleanup-audit.md`.
No Tasks 2–7, 500-image run, dependency/configuration changes, service restart,
deployment, OCR behavior changes, Xerox skills, or deletions were performed.
Runtime artifacts from the required one-fixture test were written only to a new
`For Test Results/task-1-one-fixture-20261105-01/` directory and are not staged.

## Changed files

- `scripts/batch500-contract.mjs`: five required interfaces, validated lowercase
  SHA-256 source identity, canonical inventory and deterministic SHA-256 run identity,
  same-directory exclusive temporary file + sync + rename, checkpoint reading,
  fail-closed compatibility checks, pending fixtures deduplicated by SHA.
- `scripts/tests/batch500-contract.test.mjs`: 10 tests covering deterministic identity,
  required metadata, duplicate occurrences, replacement and concurrent-reader atomicity,
  serialization failure preservation, malformed/missing checkpoint, compatibility,
  and pending/failed/review-required/missing/corrupt/wrong-SHA trace behavior.
- `scripts/e2e-batch-local.mjs`: additive per-image metadata
  `sourceSha256/buildId/processingVersion/fixturePath/status/tracePath/startedAt/completedAt`;
  original browser assertions and final exit gates unchanged; atomic report snapshots;
  fresh default run directories and rejection of existing explicit output directories.
- `.superpowers/sdd/task-1-report.md`: this appended implementation report.

## Contract and assumptions

Manifest fields are `schema, runId, runIdentity, buildId, gitCommit,
processingVersion, inventory, batches`. Inventory entries require
`fixturePath` and lowercase `sourceSha256`; extra metadata is preserved and hashed.
All inventory occurrences remain accountable, including identical SHA at different paths.
Pending selection keeps the first inventory occurrence for each SHA.

Run identity excludes the human run label and progress, includes build/commit/processing
version/full canonical inventory/batch layout, and ignores object-key and inventory ordering.
Compatibility additionally recomputes identities to detect stale hashes.
Callers must check compatibility before pending selection.

Only `completed` records with readable, parseable, source-SHA-matching trace items
are skipped. `failed`, `not_run`, `skipped_duplicate`, and `review_required`
stay pending; this conservative Task 1 helper never confirms uncertain evidence.
Task 2 orchestration and Task 3 full trace integrity verification remain out of scope.
The runner emits `review_required` for successfully processed uncertain candidates,
or `failed` when its existing required gates fail. Original trace contents are unchanged.

`writeAtomicJson` replaces mutable checkpoints/snapshots, not historical run evidence.
It serializes before touching disk, opens unique temporary files exclusively,
syncs and closes before same-directory rename, and preserves old destinations
and temporary evidence on failure. Windows lock errors retry at most five times
(20/40/60/80/100 ms); there is no unlink/delete fallback. Scratch test files are retained.

Build metadata comes from `E2E_BUILD_ID` or the selected build directory's BUILD_ID;
missing BUILD_ID records null rather than inventing identity. The processing version
defaults to the explicit runner contract label `batch-local-e2e.v1`, overridable via
`E2E_PROCESSING_VERSION`. Neither is independent runtime attestation.

## Exact test commands and captured outputs

Commands ran from `D:\Project\Digital Evi - Codex`.

### RED: module intentionally missing

```powershell
node --test scripts/tests/batch500-contract.test.mjs
```
```text
node:internal/modules/esm/resolve:271
    throw new ERR_MODULE_NOT_FOUND(
          ^

Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'D:\Project\Digital Evi - Codex\scripts\batch500-contract.mjs' imported from D:\Project\Digital Evi - Codex\scripts\tests\batch500-contract.test.mjs
    at finalizeResolution (node:internal/modules/esm/resolve:271:11)
    at moduleResolve (node:internal/modules/esm/resolve:861:10)
    at defaultResolve (node:internal/modules/esm/resolve:988:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:697:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:714:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:746:52)
    at #resolve (node:internal/modules/esm/loader:679:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:599:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:162:33)
    at ModuleJob.link (node:internal/modules/esm/module_job:252:17) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/batch500-contract.mjs'
}

Node.js v25.9.0
✖ scripts\tests\batch500-contract.test.mjs (128.1956ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 143.9886

✖ failing tests:

test at scripts\tests\batch500-contract.test.mjs:1:1
✖ scripts\tests\batch500-contract.test.mjs (128.1956ms)
  'test failed'

exit code: 1
```

### Initial implementation, sandbox restriction

```powershell
node --test scripts/tests/batch500-contract.test.mjs
```
```text
✔ run identity is deterministic across object key order and inventory ordering (4.157ms)
✔ missing identities and invalid source SHA are rejected (1.266ms)
✔ duplicate SHA inventory preserves occurrences but pending processing deduplicates by SHA (2.1092ms)
✖ atomic JSON write supports absent parent and readable complete checkpoint updates (14.8105ms)
✖ readers see only old or new complete JSON while checkpoint is replaced (6.7845ms)
✖ failed serialization preserves the prior checkpoint (6.3505ms)
✔ missing checkpoint returns null; corrupt or non-object JSON fails closed (14.2456ms)
✔ compatible checkpoint permits a different run label and result progress (1.2644ms)
✔ incompatible build, commit, processing version, inventory and batch layout are explained (2.0017ms)
✔ pending skips only completed SHA with parseable matching trace; uncertain and failed stay pending (10.9259ms)
ℹ tests 10
ℹ suites 0
ℹ pass 7
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 234.4045

✖ failing tests:

test at scripts\tests\batch500-contract.test.mjs:44:1
✖ atomic JSON write supports absent parent and readable complete checkpoint updates (14.8105ms)
  Error: EPERM: operation not permitted, rename 'C:\Users\EVE\AppData\Local\Packages\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\AC\Temp\batch500-contract-71n2cY\nested\.checkpoint.json.bfedee84-86b5-4d9b-9070-7f9c7a1d477c.tmp' -> 'C:\Users\EVE\AppData\Local\Packages\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\AC\Temp\batch500-contract-71n2cY\nested\checkpoint.json'
      at async Object.rename (node:internal/fs/promises:1426:10)
      at async writeAtomicJson (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/batch500-contract.mjs:59:3)
      at async TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:47:3)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    errno: -4048,
    code: 'EPERM',
    syscall: 'rename',
    path: 'C:\\Users\\EVE\\AppData\\Local\\Packages\\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\\AC\\Temp\\batch500-contract-71n2cY\\nested\\.checkpoint.json.bfedee84-86b5-4d9b-9070-7f9c7a1d477c.tmp',
    dest: 'C:\\Users\\EVE\\AppData\\Local\\Packages\\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\\AC\\Temp\\batch500-contract-71n2cY\\nested\\checkpoint.json'
  }

test at scripts\tests\batch500-contract.test.mjs:54:1
✖ readers see only old or new complete JSON while checkpoint is replaced (6.7845ms)
  Error: EPERM: operation not permitted, rename 'C:\Users\EVE\AppData\Local\Packages\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\AC\Temp\batch500-contract-c5APTG\.checkpoint.json.45a7949a-2705-4ddc-8310-eb9fd6104626.tmp' -> 'C:\Users\EVE\AppData\Local\Packages\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\AC\Temp\batch500-contract-c5APTG\checkpoint.json'
      at async Object.rename (node:internal/fs/promises:1426:10)
      at async writeAtomicJson (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/batch500-contract.mjs:59:3)
      at async TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:57:3)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    errno: -4048,
    code: 'EPERM',
    syscall: 'rename',
    path: 'C:\\Users\\EVE\\AppData\\Local\\Packages\\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\\AC\\Temp\\batch500-contract-c5APTG\\.checkpoint.json.45a7949a-2705-4ddc-8310-eb9fd6104626.tmp',
    dest: 'C:\\Users\\EVE\\AppData\\Local\\Packages\\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\\AC\\Temp\\batch500-contract-c5APTG\\checkpoint.json'
  }

test at scripts\tests\batch500-contract.test.mjs:67:1
✖ failed serialization preserves the prior checkpoint (6.3505ms)
  Error: EPERM: operation not permitted, rename 'C:\Users\EVE\AppData\Local\Packages\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\AC\Temp\batch500-contract-oR7Wcv\.checkpoint.json.76113a80-46af-47b7-a6db-811bea8043bc.tmp' -> 'C:\Users\EVE\AppData\Local\Packages\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\AC\Temp\batch500-contract-oR7Wcv\checkpoint.json'
      at async Object.rename (node:internal/fs/promises:1426:10)
      at async writeAtomicJson (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/batch500-contract.mjs:59:3)
      at async TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:70:3)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    errno: -4048,
    code: 'EPERM',
    syscall: 'rename',
    path: 'C:\\Users\\EVE\\AppData\\Local\\Packages\\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\\AC\\Temp\\batch500-contract-oR7Wcv\\.checkpoint.json.76113a80-46af-47b7-a6db-811bea8043bc.tmp',
    dest: 'C:\\Users\\EVE\\AppData\\Local\\Packages\\sandbox.{39ee87c5-ea3f-434f-8241-b91b2b1ee3d9}\\AC\\Temp\\batch500-contract-oR7Wcv\\checkpoint.json'
  }

exit code: 1
```

The sandbox denied same-directory renames even to new scratch destinations.
An approved unsandboxed rerun isolated a real Windows concurrent-reader race:

```powershell
node --test scripts/tests/batch500-contract.test.mjs
```
```text
✔ run identity is deterministic across object key order and inventory ordering (2.4234ms)
✔ missing identities and invalid source SHA are rejected (1.3883ms)
✔ duplicate SHA inventory preserves occurrences but pending processing deduplicates by SHA (1.6548ms)
✔ atomic JSON write supports absent parent and readable complete checkpoint updates (23.8995ms)
✖ readers see only old or new complete JSON while checkpoint is replaced (9.2415ms)
✔ failed serialization preserves the prior checkpoint (9.2408ms)
✔ missing checkpoint returns null; corrupt or non-object JSON fails closed (10.5008ms)
✔ compatible checkpoint permits a different run label and result progress (0.7696ms)
✔ incompatible build, commit, processing version, inventory and batch layout are explained (1.4257ms)
✔ pending skips only completed SHA with parseable matching trace; uncertain and failed stay pending (11.0174ms)
ℹ tests 10
ℹ suites 0
ℹ pass 9
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 212.2839

✖ failing tests:

test at scripts\tests\batch500-contract.test.mjs:54:1
✖ readers see only old or new complete JSON while checkpoint is replaced (9.2415ms)
  Error: EPERM: operation not permitted, rename 'C:\Users\EVE\AppData\Local\Temp\batch500-contract-bekWWQ\.checkpoint.json.e7b7e7d7-410c-48d2-8282-037000548483.tmp' -> 'C:\Users\EVE\AppData\Local\Temp\batch500-contract-bekWWQ\checkpoint.json'
      at async Object.rename (node:internal/fs/promises:1426:10)
      at async writeAtomicJson (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/batch500-contract.mjs:59:3)
      at async Promise.all (index 0)
      at async TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:59:26)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    errno: -4048,
    code: 'EPERM',
    syscall: 'rename',
    path: 'C:\\Users\\EVE\\AppData\\Local\\Temp\\batch500-contract-bekWWQ\\.checkpoint.json.e7b7e7d7-410c-48d2-8282-037000548483.tmp',
    dest: 'C:\\Users\\EVE\\AppData\\Local\\Temp\\batch500-contract-bekWWQ\\checkpoint.json'
  }

exit code: 1
```

Minimal root-cause reproduction (scratch files only):

```powershell
node --input-type=module -e 'import fs from "node:fs/promises"; import os from "node:os"; import path from "node:path"; const dir=await fs.mkdtemp(path.join(os.tmpdir(),"batch500-lock-proof-")); const target=path.join(dir,"target.json"); const temp=path.join(dir,"new.tmp"); await fs.writeFile(target,"{}"); await fs.writeFile(temp,"{}"); const reader=await fs.open(target,"r"); try { await fs.rename(temp,target); console.log("open-reader rename succeeded"); } catch(e) { console.log("open-reader rename: "+e.code); } await reader.close(); try { await fs.rename(temp,target); console.log("closed-reader rename succeeded"); } catch(e) { console.log("closed-reader rename: "+e.code); }'
```
```text
open-reader rename: EPERM
closed-reader rename succeeded

exit code: 0
```

### GREEN after bounded Windows lock handling

```powershell
node --test scripts/tests/batch500-contract.test.mjs
```
```text
✔ run identity is deterministic across object key order and inventory ordering (2.9597ms)
✔ missing identities and invalid source SHA are rejected (1.4036ms)
✔ duplicate SHA inventory preserves occurrences but pending processing deduplicates by SHA (2.0469ms)
✔ atomic JSON write supports absent parent and readable complete checkpoint updates (24.6366ms)
✔ readers see only old or new complete JSON while checkpoint is replaced (208.8425ms)
✔ failed serialization preserves the prior checkpoint (6.7485ms)
✔ missing checkpoint returns null; corrupt or non-object JSON fails closed (10.6337ms)
✔ compatible checkpoint permits a different run label and result progress (0.8208ms)
✔ incompatible build, commit, processing version, inventory and batch layout are explained (1.1994ms)
✔ pending skips only completed SHA with parseable matching trace; uncertain and failed stay pending (10.523ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 422.2465

exit code: 0
```

### Final focused rerun before commit

```powershell
node --test scripts/tests/batch500-contract.test.mjs
```
```text
✔ run identity is deterministic across object key order and inventory ordering (3.5448ms)
✔ missing identities and invalid source SHA are rejected (1.0233ms)
✔ duplicate SHA inventory preserves occurrences but pending processing deduplicates by SHA (1.4566ms)
✔ atomic JSON write supports absent parent and readable complete checkpoint updates (28.1103ms)
✔ readers see only old or new complete JSON while checkpoint is replaced (246.7817ms)
✔ failed serialization preserves the prior checkpoint (7.871ms)
✔ missing checkpoint returns null; corrupt or non-object JSON fails closed (10.9123ms)
✔ compatible checkpoint permits a different run label and result progress (0.8667ms)
✔ incompatible build, commit, processing version, inventory and batch layout are explained (1.6787ms)
✔ pending skips only completed SHA with parseable matching trace; uncertain and failed stay pending (9.9094ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 467.3752

exit code: 0
```

### Required existing one-fixture browser E2E

Read-only preflight outside the sandbox returned HTTP 200 and an existing bundled
Playwright Chromium executable. No service changes or browser installation were required.

```powershell
$env:E2E_BATCH_LIMIT='1'
$env:E2E_FIXTURE_ROOTS='For Test/Done'
$env:E2E_FIXTURE_FILES='For Test/Done/A4_IMG_ (100).PNG'
$env:E2E_OUT_DIR='For Test Results/task-1-one-fixture-20261105-01'
node scripts/e2e-batch-local.mjs
```
```text
{
  "outDir": "D:\\Project\\Digital Evi - Codex\\For Test Results\\task-1-one-fixture-20261105-01",
  "processed": 1,
  "failed": 0,
  "candidatesDetected": 1,
  "traceCandidates": 1,
  "amountPresent": 1,
  "referencePresent": 1,
  "senderNamePresent": 0,
  "receiverNamePresent": 1,
  "needsReview": 1,
  "sourceSha256Present": 1,
  "sourcePagePresent": 0,
  "externalProviderCalls": 0,
  "consoleErrorCases": 0,
  "pageErrorCases": 0
}

exit code: 0
```

The real input traversed browser upload, processing, JSON Trace download, reviewer
evidence table, screenshot, partial report and final report. Candidate/field evidence
remained review-required, with no observed forbidden provider route or page/console errors.

### End-result metadata and source identity inspection

```powershell
node --input-type=module -e 'import fs from "node:fs/promises"; import {createHash} from "node:crypto"; const dir="For Test Results/task-1-one-fixture-20261105-01"; const report=JSON.parse(await fs.readFile(dir+"/report.json","utf8")); const result=report.results[0]; const actual=createHash("sha256").update(await fs.readFile(result.fixturePath)).digest("hex"); const trace=JSON.parse(await fs.readFile(result.tracePath,"utf8")); console.log(JSON.stringify({processed:report.processed,failed:report.failed,fieldAuditPassed:report.fieldAuditPassed,reviewDerivedPreviewVisible:report.reviewDerivedPreviewVisible,result,shaMatches:actual===result.sourceSha256,traceSourceMatches:trace.items.some(item=>item.source?.sha256===actual),timestampsValid:Date.parse(result.completedAt)>=Date.parse(result.startedAt)},null,2));'
```
```text
{
  "processed": 1,
  "failed": 0,
  "fieldAuditPassed": 1,
  "reviewDerivedPreviewVisible": 1,
  "result": {
    "index": 1,
    "fixture": "D:\\Project\\Digital Evi - Codex\\For Test\\Done\\A4_IMG_ (100).PNG",
    "fixturePath": "D:\\Project\\Digital Evi - Codex\\For Test\\Done\\A4_IMG_ (100).PNG",
    "sourceSha256": "29f2fa19ed23c218937129cf7b77093d99f48bd5901f6b76a699075aee1bf73b",
    "buildId": "3ev1rjPH98s3lb5aLS_7A",
    "processingVersion": "batch-local-e2e.v1",
    "status": "review_required",
    "tracePath": "D:\\Project\\Digital Evi - Codex\\For Test Results\\task-1-one-fixture-20261105-01\\001-trace.json",
    "startedAt": "2026-11-05T10:24:59.054Z",
    "completedAt": "2026-11-05T10:25:48.635Z",
    "steps": [
      {
        "name": "upload-and-process",
        "ok": true
      }
    ],
    "apiResponses": [
      {
        "url": "http://127.0.0.1:3450/api/derived-image/upscayl",
        "status": 200,
        "method": "POST"
      }
    ],
    "consoleErrors": [],
    "pageErrors": [],
    "assertions": {
      "inputVisible": true,
      "autoYoloFinished": false,
      "candidateCount": 1,
      "tracePath": "D:\\Project\\Digital Evi - Codex\\For Test Results\\task-1-one-fixture-20261105-01\\001-trace.json",
      "traceCandidates": 1,
      "amountPresent": 1,
      "referencePresent": 1,
      "senderNamePresent": 0,
      "receiverNamePresent": 1,
      "needsReview": 1,
      "sourceSha256Present": 1,
      "sourcePagePresent": 0,
      "searchableOverlayVisible": false,
      "enhancementArtifactsVisible": false,
      "reviewDerivedPreviewVisible": true,
      "stitchAuditVisible": false,
      "noExternalProviderCall": true,
      "consoleErrors": 0,
      "pageErrors": 0,
      "fieldAudit": {
        "candidateCount": 1,
        "fieldCount": 12,
        "sourceSha256Present": 1,
        "completeFieldEvidence": 12,
        "reviewRequiredCandidates": 1,
        "passed": true
      }
    }
  },
  "shaMatches": true,
  "traceSourceMatches": true,
  "timestampsValid": true
}

exit code: 0
```

## Self-review

Reviewed all three implementation/test files and the runner diff against its parent.
All five required exports are covered by focused tests. Scope stayed within Task 1.
No dependency additions, provider changes, OCR changes, Xerox changes, or deletions.

```powershell
node --check scripts/batch500-contract.mjs
node --check scripts/e2e-batch-local.mjs
node --check scripts/tests/batch500-contract.test.mjs
git diff --check
```

All returned exit 0; syntax checks produced no output. Git reported only the
existing repository CRLF conversion warning for the edited runner.

The assertion block and final exit-gate text were also compared mechanically
against the pre-Task-1 HEAD using Node assertions:

```powershell
node --input-type=module -e 'import fs from "node:fs"; import {execFileSync} from "node:child_process"; import assert from "node:assert/strict"; const file="scripts/e2e-batch-local.mjs"; const before=execFileSync("git",["show","HEAD:"+file],{encoding:"utf8"}); const after=fs.readFileSync(file,"utf8"); const assertions=s=>s.match(/result.assertions = \{[\s\S]*?\n    \};/)[0]; assert.equal(assertions(after),assertions(before)); assert.equal(after.slice(after.lastIndexOf("if (report.failed")),before.slice(before.lastIndexOf("if (report.failed"))); console.log("Original browser assertions and final failure gates unchanged");'
```
```text
Original browser assertions and final failure gates unchanged
exit code: 0
```

Commit commands:

```powershell
git add -- scripts/batch500-contract.mjs scripts/tests/batch500-contract.test.mjs scripts/e2e-batch-local.mjs
git diff --cached --stat
git diff --cached --check
git commit -m "test: define resumable batch checkpoint contract"
git rev-parse HEAD
```
```text
3 files changed, 271 insertions(+), 5 deletions(-)
[codex/task-1-contract 4c3f9a9f] test: define resumable batch checkpoint contract
4c3f9a9f86eb4af4cfecf25cc5e808510e0760ef
exit code: 0
```

## Concerns and limits

- E2E exit 0 proves the existing one-fixture gates plus inspected metadata only.
  The same report records senderNamePresent=0, sourcePagePresent=0,
  autoYoloFinished=false, searchableOverlayVisible=false,
  enhancementArtifactsVisible=false, stitchAuditVisible=false. These are
  observations, not newly fixed OCR/UI features or proof of full audit readiness.
- A real 500-image run, crash/power-loss durability, full integration resume,
  runtime build attestation, restart/reboot, PDF/export and Task 3 trace-integrity
  verification were not run and are outside this brief.
- Atomic replacement works in the real Windows environment; the restricted
  sandbox denied rename, so rename/browser/git verification used approved escalation.
- Existing explicit output directories now fail closed; callers must supply
  a fresh directory. Default directories are unique. This enforces the brief's
  no-overwrite requirement.
- Pre-existing unrelated untracked files were not staged. The report already
  contained a different Task 1's historical content; it was preserved above.
- No implementation blocker remains for the requested Task 1.

---

# Task 1 reviewer NEEDS_FIX — completion/review separation and schema validation

## Scope and result

Both requested findings are addressed in the existing Task 1 files only.
This appendix supersedes the earlier statements that all review-required records
stay pending and that manifest and checkpoint use the same schema.

Base implementation commit: `4c3f9a9f86eb4af4cfecf25cc5e808510e0760ef`.
The fix and this appended report are committed together; identify that commit with
`git log -1 --format=%H -- scripts/batch500-contract.mjs`.
No historical report content was replaced.

Changed files:
- `scripts/batch500-contract.mjs`
- `scripts/e2e-batch-local.mjs`
- `scripts/tests/batch500-contract.test.mjs`
- `.superpowers/sdd/task-1-report.md`

## Finding 1: successfully processed uncertain evidence can resume without reprocessing

Root cause: the runner wrote `status: review_required` on successful uncertain
results, while pending selection required `status: completed`.

Added an independent `processingStatus` (`not_run | completed | failed`).
The runner initializes it to `not_run` and calls the shared
`finalizeBatchResult` helper in its existing finally block. That helper preserves
the prior field-audit, provider, page-error, derived-preview and processing-error
failure behavior and timestamp handling. On success it sets only processing
completion, retaining `status: review_required`. It does not mutate candidates,
confirmation flags, OCR data, or trace files.

Pending selection now skips explicit `processingStatus: completed` records
whose status is `review_required` or `completed`, with no processing error and
a readable JSON trace containing the matching source SHA. Missing completion
metadata, unfinished/failed statuses, missing/corrupt/mismatched traces stay pending.

The regression uses the exact finalizer invoked by the real runner, writes and
reads a checkpoint, checks compatibility, verifies that pending selection skips
the source, and verifies unchanged review-required/unconfirmed evidence. Failure
cases cover errors, provider routes, page errors, failed field audit and required
preview failure. The existing optional-preview switch remains effective.

## Finding 2: reject unsupported schemas

Root cause: comparing schema strings for equality accepted matching unknown schemas.
The supported pair is now explicitly:
- Manifest: `digital-evidence.batch500-run.v1`
- Checkpoint: `digital-evidence.batch500-checkpoint.v1`

Each side is independently validated. Missing/empty/unknown/future schemas are
rejected even when both strings match, and a manifest schema used as a checkpoint
schema is rejected. Build, commit, processing version, inventory, batch layout and
recomputed identity validation remain in place.

## RED evidence

Initial regression run exposed the missing finalizer export. After changing the
test import to allow independent assertions to execute, the behavioral RED run was:

```powershell
node --test scripts/tests/batch500-contract.test.mjs
```
```text
✔ run identity is deterministic across object key order and inventory ordering (2.4772ms)
✔ missing identities and invalid source SHA are rejected (0.9075ms)
✔ duplicate SHA inventory preserves occurrences but pending processing deduplicates by SHA (2.9684ms)
✔ atomic JSON write supports absent parent and readable complete checkpoint updates (22.7351ms)
✔ readers see only old or new complete JSON while checkpoint is replaced (233.2309ms)
✔ failed serialization preserves the prior checkpoint (6.044ms)
✔ missing checkpoint returns null; corrupt or non-object JSON fails closed (11.524ms)
✖ compatible checkpoint permits a different run label and result progress (2.6613ms)
✖ compatibility requires supported manifest and checkpoint schemas even when unknown schemas match (7.5759ms)
✔ incompatible build, commit, processing version, inventory and batch layout are explained (1.6845ms)
✔ pending skips only completed SHA with parseable matching trace; uncertain and failed stay pending (10.7952ms)
✖ runner finalization makes review-required results checkpoint-completable without confirming evidence (4.7694ms)
✖ runner finalization never marks failed gates or processing errors completed (0.6118ms)
ℹ tests 13
ℹ suites 0
ℹ pass 9
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 458.1113

✖ failing tests:

test at scripts\tests\batch500-contract.test.mjs:89:1
✖ compatible checkpoint permits a different run label and result progress (2.6613ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    {
  +   compatible: false,
  +   reasons: [
  +     'schema mismatch or missing'
  +   ]
  -   compatible: true,
  -   reasons: []
    }

      at TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:91:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: { compatible: false, reasons: [ 'schema mismatch or missing' ] },
    expected: { compatible: true, reasons: [] },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at scripts\tests\batch500-contract.test.mjs:94:1
✖ compatibility requires supported manifest and checkpoint schemas even when unknown schemas match (7.5759ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

    assert.ok(invalidManifest.reasons.some((reason) => reason.includes("manifest schema")))

      at TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:101:12)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at scripts\tests\batch500-contract.test.mjs:140:1
✖ runner finalization makes review-required results checkpoint-completable without confirming evidence (4.7694ms)
  TypeError: contract.finalizeBatchResult is not a function
      at TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:152:12)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)

test at scripts\tests\batch500-contract.test.mjs:167:1
✖ runner finalization never marks failed gates or processing errors completed (0.6118ms)
  TypeError: contract.finalizeBatchResult is not a function
      at TestContext.<anonymous> (file:///D:/Project/Digital%20Evi%20-%20Codex/scripts/tests/batch500-contract.test.mjs:175:14)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1201:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:831:18)
      at Test.postRun (node:internal/test_runner/test:1330:19)
      at Test.run (node:internal/test_runner/test:1258:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7)

exit code: 1
```

## Focused GREEN tests

```powershell
node --test scripts/tests/batch500-contract.test.mjs
```
```text
✔ run identity is deterministic across object key order and inventory ordering (2.3543ms)
✔ missing identities and invalid source SHA are rejected (0.9464ms)
✔ duplicate SHA inventory preserves occurrences but pending processing deduplicates by SHA (1.4049ms)
✔ atomic JSON write supports absent parent and readable complete checkpoint updates (23.0786ms)
✔ readers see only old or new complete JSON while checkpoint is replaced (231.8576ms)
✔ failed serialization preserves the prior checkpoint (10.5356ms)
✔ missing checkpoint returns null; corrupt or non-object JSON fails closed (15.4511ms)
✔ compatible checkpoint permits a different run label and result progress (0.78ms)
✔ compatibility requires supported manifest and checkpoint schemas even when unknown schemas match (1.7973ms)
✔ incompatible build, commit, processing version, inventory and batch layout are explained (1.076ms)
✔ pending skips only completed SHA with parseable matching trace; uncertain and failed stay pending (8.4652ms)
✔ runner finalization makes review-required results checkpoint-completable without confirming evidence (11.6857ms)
✔ runner finalization never marks failed gates or processing errors completed (0.591ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 478.804

exit code: 0
```

The focused suite used approved unsandboxed execution because this Windows
sandbox denies the rename operations required by the existing atomic-write tests.
No dependency or service configuration changes were made.

## Syntax and whitespace checks

Ran the requested combined command and additionally checked each file separately,
because Node's --check accepts one script entry point:

```powershell
node --check scripts/batch500-contract.mjs scripts/e2e-batch-local.mjs scripts/tests/batch500-contract.test.mjs
node --check scripts/batch500-contract.mjs
node --check scripts/e2e-batch-local.mjs
node --check scripts/tests/batch500-contract.test.mjs
git diff --check
```

All commands returned exit 0. Syntax checks had no output. Git emitted its CRLF
conversion warnings but no whitespace errors.

## Self-review

Reviewed all changed implementation/test lines. A mechanical comparison against
the pre-fix HEAD confirmed the original browser assertions and final exit gates
are byte-identical:

```text
Original browser assertions and final failure gates unchanged
exit code: 0
```

The success-status calculation, trace content, original source evidence,
provider block routes and review semantics are unchanged. The only moved runner
logic is metadata finalization, now shared with regression tests.

## Additional real one-fixture browser regression

```powershell
$env:E2E_BATCH_LIMIT='1'
$env:E2E_FIXTURE_ROOTS='For Test/Done'
$env:E2E_FIXTURE_FILES='For Test/Done/A4_IMG_ (100).PNG'
$env:E2E_OUT_DIR='For Test Results/task-1-review-fix-one-fixture-20261105-01'
node scripts/e2e-batch-local.mjs
```
```text
{
  "outDir": "D:\\Project\\Digital Evi - Codex\\For Test Results\\task-1-review-fix-one-fixture-20261105-01",
  "processed": 1,
  "failed": 0,
  "candidatesDetected": 1,
  "traceCandidates": 1,
  "amountPresent": 1,
  "referencePresent": 1,
  "senderNamePresent": 0,
  "receiverNamePresent": 1,
  "needsReview": 1,
  "sourceSha256Present": 1,
  "sourcePagePresent": 0,
  "externalProviderCalls": 0,
  "consoleErrorCases": 0,
  "pageErrorCases": 0
}

exit code: 0
```

Then exercised the actual new runner result through checkpoint persistence and
resume selection, rather than relying solely on a synthetic helper fixture:

```powershell
node --input-type=module -e 'import fs from "node:fs/promises"; import path from "node:path"; import assert from "node:assert/strict"; import {createHash} from "node:crypto"; import {execFileSync} from "node:child_process"; import {createBatchRunManifest,writeAtomicJson,readCheckpoint,isCheckpointCompatible,getPendingFixtures} from "./scripts/batch500-contract.mjs"; const dir="For Test Results/task-1-review-fix-one-fixture-20261105-01"; const report=JSON.parse(await fs.readFile(path.join(dir,"report.json"),"utf8")); assert.equal(report.processed,1); const result=report.results[0]; const sourceSha256=createHash("sha256").update(await fs.readFile(result.fixturePath)).digest("hex"); assert.equal(result.sourceSha256,sourceSha256); assert.equal(result.processingStatus,"completed"); assert.equal(result.status,"review_required"); const traceBefore=await fs.readFile(result.tracePath,"utf8"); const candidates=JSON.parse(traceBefore).items.flatMap(item=>item.candidates||[]); assert.ok(candidates.length>0); assert.ok(candidates.every(candidate=>candidate.needsReview===true && candidate.isConfirmed!==true)); const inventory=[{fixturePath:result.fixturePath,sourceSha256}]; const manifest=createBatchRunManifest({runId:"task-1-review-fix",buildId:result.buildId,gitCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),processingVersion:result.processingVersion,inventory,batches:[{batchId:"001",offset:0,limit:1}]}); const checkpointPath=path.join(dir,"checkpoint.json"); await writeAtomicJson(checkpointPath,{...manifest,schema:"digital-evidence.batch500-checkpoint.v1",results:report.results}); const checkpoint=await readCheckpoint(checkpointPath); assert.deepEqual(isCheckpointCompatible(checkpoint,manifest),{compatible:true,reasons:[]}); assert.deepEqual(getPendingFixtures(checkpoint,inventory),[]); assert.equal(checkpoint.results[0].status,"review_required"); assert.equal(await fs.readFile(result.tracePath,"utf8"),traceBefore); console.log(JSON.stringify({processed:report.processed,processingStatus:result.processingStatus,status:result.status,checkpointCompatible:true,pendingFixtures:0,sourceShaMatches:true,traceUnchanged:true,reviewRequiredCandidates:candidates.length,externalProviderCalls:report.externalProviderCalls,pageErrorCases:report.pageErrorCases},null,2));'
```
```text
{
  "processed": 1,
  "processingStatus": "completed",
  "status": "review_required",
  "checkpointCompatible": true,
  "pendingFixtures": 0,
  "sourceShaMatches": true,
  "traceUnchanged": true,
  "reviewRequiredCandidates": 1,
  "externalProviderCalls": 0,
  "pageErrorCases": 0
}

exit code: 0
```

Observed path: real image upload → processing → reviewer table/trace/screenshot →
runner result with completed processing and review-required evidence → atomic
checkpoint write/read → supported schema/identity check → zero pending fixtures.
The source SHA matched, the JSON trace remained byte-identical, and its one
candidate still required review and was not confirmed. No provider route or page
error was observed. Runtime evidence remains in the fresh directory above and
is excluded from the commit.

## Concerns and untested scope

- Legacy records without explicit processing completion are conservatively pending.
  Legacy checkpoints using the run-manifest schema are rejected; no automatic
  migration or promotion of old records was implemented.
- This verifies one real runner result through checkpoint selection. The future
  multi-batch orchestrator, crash recovery, 500-image run and reboot were not run.
- The real fixture still reports senderNamePresent=0 and sourcePagePresent=0;
  this fix makes no OCR extraction or provenance completeness claims beyond
  the source-SHA and trace checks recorded above.
- No Xerox skills, dependencies, authentication, database, deployment or
  unrelated project files were changed. No destructive command was run.
- No blocker remains for these two Task 1 review findings.

Staged whitespace follow-up: the first staged check caught trailing spaces in
quoted RED output and an extra final blank line. These were removed only from
this appended fix report; historical report content and implementation were unchanged.
