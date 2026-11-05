# Task 5 fix — reviewer P1/P2 (current execution, 2026-11-05)

## Scope and result

The two reviewer fixes are implemented. Focused simulated regressions pass; live service recovery, reboot and browser/OCR E2E have NOT been exercised in this execution. The historical report below is retained for provenance and is not fresh evidence of this fix.

Changed source/test files: `scripts/run-service-reboot-audit.ps1` and `scripts/tests/service-reboot-audit.test.mjs`. This report is the only additional repository file included in the fix commit. Existing unrelated work is excluded.

## Root causes and corrections

- P1: the recovery catch called StartAction immediately after a stop timeout. It now reads the current state; a pending stop must reach terminal Stopped within a separate bounded restoration window before start is submitted. Running/StartPending avoid a redundant start. Restoration is successful only after observing Running. The original audit timeout remains not_run even when restoration succeeds. A permanently pending stop retains both the original timeout and the restoration timeout, with no start submitted.
- P2: identity preflight ran before the AfterReboot Running wait. Prior intent, machine/service/selected identity and changed-boot checks now precede readiness. Service Running and HTTP 200 share one TimeoutSeconds readiness budget before runtime evidence collection and identity preflight. HTTP connection errors/503 are retried within that budget; a ready but mismatched identity still fails preflight. Readiness states and negative audit/E2E JSON are retained.
- Transport detail: Invoke-WebRequest uses a timeout derived from remaining readiness time, rounded up to whole seconds. A late HTTP success is rejected after the deadline. Whole-second transport timeout and command scheduling can delay returning a timeout beyond the logical deadline; no claim of a hard real-time bound is made. Identity collection remains a separate step with the collector's existing timeouts unchanged.

## Fresh empirical checks (commands actually executed)

- RED before implementation: `node --test scripts/tests/service-reboot-audit.test.mjs` returned exit 1, 11 passed / 5 failed. Failures demonstrated redundant/premature start, falsely successful restoration from StopPending, and premature AfterReboot preflight.
- Final GREEN: `node --test scripts/tests/service-reboot-audit.test.mjs scripts/tests/runtime-evidence-contract.test.mjs` returned exit 0, **21 passed / 0 failed / 0 skipped**, duration 24933.4798 ms. This comprises 16 Task 5 tests and 5 collector contract regressions.
- `node --check scripts/tests/service-reboot-audit.test.mjs`: exit 0.
- PowerShell AST parser for `scripts/run-service-reboot-audit.ps1`: no parse errors, exit 0.
- `git diff --check` for the two changed source/test files: exit 0; Git emitted only LF-to-CRLF working-copy notices.
- Final full test transcript: `C:\Users\EVE\AppData\Local\Packages\sandbox.{e4fc41f2-bf44-4f9a-b201-ef9632e17715}\AC\Temp\task5-fix-tests-b42a5a8f71c24fc69ee0185994a0321a.log` (temporary local evidence; not committed).

## Simulated input, flow and outputs

The tests execute the actual PowerShell controller/orchestrator in pwsh with injected service, SCM, boot, HTTP and short-E2E boundaries. They write and read actual temporary JSON artifacts. Those artifacts describe simulation; they are not real boot/service/HTTP observations.

- Stop timeout -> StopPending -> Stopped -> start only from Stopped -> observed Running: restoration recovered while original audit remains not_run. The zero-second timeout makes this transition deterministic by read sequence.
- Permanent StopPending with TimeoutSeconds=1: original stop window and restoration window both expire; measured controller duration is asserted >=2 and <4 seconds; action list contains only stop.
- Restoration reaching only StartPending fails the Running verification. Existing start timeout/stop-error checks remain passing.
- Valid synthetic prior intent and changed boot -> two StartPending observations -> Running -> HTTP connection refusal -> HTTP 200 -> identity -> synthetic short E2E: completed, os_reboot recorded, review_required retained, runtime-before and healthy report JSON checked.
- Persistent StartPending or HTTP 503 with TimeoutSeconds=1: not_run, readiness timeout, no short-E2E call, negative report artifacts checked. Ready HTTP with wrong build identity: preflight rejected, no browser/E2E call.
- Existing same-boot rejection, reboot confirmation/Administrator gate, listener/identity validation, restart post-identity mismatch, fresh-output protection and short-wrapper checks remain passing.

## Untested and boundaries

No real service stop/start, OS reboot, browser upload/process flow, real HTTP readiness during boot, OCR or provider request was run. Live end-to-end acceptance remains untested; this task establishes controller/orchestration regression evidence using simulation only. No full batch, file deletion, dependency/configuration changes, or Xerox/provider/OCR behavior changes were performed. No historical live observation below is promoted to evidence for this fix.

Commit identity is reported in the final response after the scoped commit and its contents are checked; it is intentionally not embedded in its own content.

---

# Historical Task 5 — Service recovery/reboot audit report (preserved, not rerun)

Date: 2026-11-05. Workspace: D:\Project\Digital Evi - Codex.
This report is written solely from the current Task 5 brief and this execution. No historical Task 5 content or detection-task results are reused.

## Final status

Implementation and focused automated checks completed. Live recovery acceptance is BLOCKED / not_run at the identity preflight. Actual stop/start, OS reboot and the one-slip browser flow were not executed. This is not an end-to-end pass.

The current audit invocation returned exit 1 with the exact blocker:
`Preflight rejected: gitCommit mismatch`.

## Scope and implementation

Only these source/test files are intended for the Task 5 commit:
- scripts/run-service-reboot-audit.ps1
- scripts/tests/service-reboot-audit.test.mjs

The brief's design path under plans does not exist; the actual design was read from docs/superpowers/specs/2026-11-05-batch500-reboot-cleanup-design.md, with implementation plan docs/superpowers/plans/2026-11-05-batch500-reboot-cleanup-audit.md, Task 5 only.

The audit defaults to read-only Preflight. Restart is explicitly labeled restart_fallback. It requires an existing selected run, Automatic/Running service, service ownership of the localhost listener, HTTP 200 and matching service/source/HTTP build identities and source commit. It submits SCM stop/start requests, polls observed states with timestamps and bounded waits, and attempts service restoration if stop/start or waiting fails. Timeout is not_run with the original failure and restoration result preserved.

Reboot is an explicit mode requiring both -ConfirmReboot and Administrator execution. It persists reboot intent before Restart-Computer, uses no Force, and installs no scheduled task or service changes. AfterReboot requires a prior Reboot intent, same machine/service and selected build/commit, and changed LastBootUpTime before treating health as post-reboot evidence. A dispatch error is retained in a separate reboot-dispatch-error.json; requested intent alone is not reboot success. No explicit reboot was requested/executed in this session.

After recovery, runtime-after.json and health-after-reboot.json verify HTTP/build identity. The short wrapper reuses scripts/e2e-batch-local.mjs unchanged, forces one explicit fixture and limit 1, preserves its provider-route blocking and OCR/browser assertions, validates source SHA, result, trace, screenshot, browser error counts and review_required preservation. Child-process E2E options are restored afterwards. Browser failures are distinguished from not_run. If browser results are unobserved, the negative short-e2e/report.json has null counts/trace/screenshot, never fabricated zero-error evidence.

## TDD and checks

- Initial RED: node --test scripts/tests/service-reboot-audit.test.mjs; exit 1, 0/6 passed, script absent.
- Initial GREEN: 6/6 passed after implementation.
- Additional RED/GREEN regressions cover collector loading preserving explicit CLI arguments; E2E exceptions recorded as failed; and a negative short-e2e/report.json when preflight blocks execution.
- Final command: node --test scripts/tests/service-reboot-audit.test.mjs scripts/tests/runtime-evidence-contract.test.mjs
- Final result: exit 0, 16 passed / 0 failed (11 Task 5 tests + 5 Task 4 collector regressions).
- node --check scripts/tests/service-reboot-audit.test.mjs: exit 0.
- PowerShell parser: no syntax errors.
- Final evidence JSON was parsed and checked for the exact mismatch, absent recovery, not_run health/E2E, null browser counts, HTTP 200, owned listener and no collection errors.

Tests substitute OS/service/HTTP/Node boundaries. The short-wrapper test writes synthetic report/trace/screenshot placeholders to temporary directories to exercise validation; they are NOT real image processing or browser evidence. An intermediate test harness variable collision was corrected before the final 16/16 rerun. Build/typecheck was not run because no application/TypeScript source changed. No real browser or OCR assertion success is claimed.

## Live invocation and evidence

Current authoritative evidence root: For Test Results/task5-recovery-49f41d0dbff34102b4f006ff337d01c8/final-live-audit

Command (read outside sandbox restrictions, with identity gate active):
```powershell
pwsh -NoProfile -NonInteractive -File scripts/run-service-reboot-audit.ps1 -Mode Restart -RunMetadataPath 'For Test Results/task2-acceptance-2026-11-05T11-08-45-872Z/pilot/manifest.json' -OutDir 'For Test Results/task5-recovery-49f41d0dbff34102b4f006ff337d01c8/final-live-audit' -FixturePath 'For Test/Done/A4_IMG_ (1).JPEG'
```

Current observations, 2026-11-05T12:11:26Z through 12:11:31Z:
- Service digitalevidenceenterprise.exe: Running / Auto.
- Service/source/HTTP BUILD_ID: 3ev1rjPH98s3lb5aLS_7A, all matching.
- HTTP: 200; service owns listener; no collection errors.
- Service PID 32708 / listener PID 36796, same as this run's earlier preflight observations.
- Observed source git HEAD: 9165d380a7d14fb17ccd143530d6c30b9c09f5eb.
- Selected existing pilot commit: 8b1daa9ed58c50438b355d9d583bfdea2f2f28a8.
- Preflight incompatible solely because of gitCommit mismatch. No metadata was rewritten to bypass it.
- runtime-before.json: actual current observation.
- service-reboot-report.json: status not_run, recovery null, OS reboot not_run, exact blocker above.
- health-after-reboot.json: not_run; no observed recovery boundary. Preflight HTTP is not labeled post-recovery health.
- short-e2e/report.json: not_run; screenshot/trace and console/page counts null because browser did not run.
- runtime-after.json, real screenshot and real JSON trace: NOT PRODUCED, intentionally not fabricated.

Logs in For Test Results/task5-recovery-49f41d0dbff34102b4f006ff337d01c8:
- tdd-red.log, tdd-green.log, cli-red.log, orchestration-red.log, not-run-report-red.log
- verified-final-regression.log (authoritative 16/16 result)
- final-live-audit.log and evidence-validation.log
- Earlier live-audit (sandbox denied CIM/SCM/socket), live-preflight and live-restart-audit directories are retained separately; final-live-audit is authoritative for this report.

The explicit fixture exists. Current SHA-256 is 13f63151d2aa908b83b3c81bc330f4d8e689aefdc2b8c33acdbc80d39c59b995, matching the selected manifest. It was not uploaded or modified by this task.

## Acceptance, unknowns and concerns

Implemented/automated checks passed: state controller, timeout/restoration, identity checks, explicit Administrator reboot gate, changed-boot gate, fresh/non-overwriting evidence, one-fixture wrapper, review preservation and error reporting. Live negative preflight behavior was exercised and retained.

Not tested live: actual stop/start/restoration, actual reboot or post-reboot resume, post-recovery HTTP/build identity, real upload/process/table/JSON trace, real screenshot, real browser error counts and live provider blocking. Automatic boot behavior and OCR outcome remain unknown.

To proceed with real recovery/E2E, an independently valid selected run/build/source identity is needed. Creating fabricated matching metadata, changing build/service configuration, or changing the runtime to bypass this blocker was outside this task. The collector's gitCommit is checkout HEAD, not build-time commit attestation; matching BUILD_ID alone does not prove the binary was built from current HEAD.

No full 500 batch, file deletion, Xerox skill access/change, provider/dependency addition, OCR assertion change, service configuration change or actual OS reboot occurred. Existing unrelated working-tree changes remain outside the Task 5 commit. Report/evidence remain local and uncommitted as requested; commit is limited to the two Task 5 source/test files.

Commit: e6e55b8fe04def2b7b45f50e6fed90f2f1f8e030 — test: audit service recovery and post-reboot e2e. Confirmed by git show: exactly the two Task 5 source/test files, 427 insertions. Scoped staged diff whitespace check passed. Initial Git index write was denied by sandbox; the explicitly authorized scoped commit succeeded outside that restriction. No audit or E2E rerun occurred after the final stop instruction. Evidence records pre-commit HEAD 9165d380a7d14fb17ccd143530d6c30b9c09f5eb; it was not relabeled as an observation of the new commit.
