# Promote build path fix

Date: 2026-11-05

## Goal and acceptance criteria

Limit production changes to `scripts/promote-enterprise-build.ps1`. Both
`-BuildSource` and `-BuildTarget` must resolve relative paths against the project
root, independently of the caller's working directory, and preserve absolute
paths exactly without a duplicated project root. Add a focused, non-destructive
script-contract regression test, check syntax/diff, and commit only source,
test, and this report.

## Root cause and minimal change

Both path assignments previously called `Join-Path $projectRoot` unconditionally.
Executing those assignments with an absolute input produced, for example,
`D:\Project\Digital Evi - Codex\D:\Project\Digital Evi - Codex\source build`.
The same failure was observed in Windows PowerShell and PowerShell 7.

Only the two assignments were changed: use `[System.IO.Path]::IsPathRooted`
to return the supplied rooted path directly; otherwise retain the existing
project-root `Join-Path` behavior. Parameter defaults and promotion logic remain
unchanged.

## TDD evidence and checks

- Added `scripts/tests/promote-enterprise-build.test.mjs` before changing source.
- RED: `node --test scripts/tests/promote-enterprise-build.test.mjs` exited 1.
  In each shell, default/nested relative cases passed and all five cases involving
  absolute paths failed on incorrect resolved strings. Node counted 4 passes and
  12 failures, including the two failed parent tests.
- GREEN after the two-line source fix: the same command exited 0, with 16 passes,
  zero failures/skips (14 case subtests plus two parent tests).
- Seven cases per shell cover defaults, nested relative paths with spaces,
  absolute paths inside the project, absolute paths on another drive, UNC paths,
  absolute source/relative target, and relative source/absolute target. Both
  resolved output strings are asserted against independently calculated results.
- Child PowerShell processes run from the existing OS temporary directory, away
  from the project root, to catch accidental dependence on the current directory.
- Each shell parses the entire production script with the PowerShell AST parser
  and rejects syntax errors. The test then extracts only the three project/source/
  target assignments. Command calls are restricted to `Split-Path` and `Join-Path`;
  method calls are restricted to static `[System.IO.Path]::IsPathRooted`.
- `node --check scripts/tests/promote-enterprise-build.test.mjs`: exit 0.
- `git diff --check`: exit 0. Git emitted LF-to-CRLF conversion warnings, including
  one for the pre-existing unrelated `task-2-report.md` change; no whitespace errors.

## Scope and limitations

The verified result is the isolated script path contract executed in both local
PowerShell engines. Inputs are synthetic path strings; the other drive and UNC
share need not exist. This does not establish deployment or service correctness.
No production script invocation/dot-sourcing, promotion, service restart, batch
run, filesystem copy/delete, application execution, or OCR/provider/Xerox change
was performed. Tests create no fixtures or temporary files and require no admin
execution. Existing unrelated working-tree files are excluded from the commit.

The original checks above did not cover rooted-but-not-fully-qualified paths.
Reviewer P2 identified that gap; the follow-up below supersedes the original
claim of no remaining blocker for path independence.

## Reviewer P2 follow-up (2026-11-05)

Scope: only path classification in the two source/target assignments, focused
regressions, and this report. `IsPathRooted` alone classified both `\staging\source`
and `C:staging\source` as directly usable, leaving caller-dependent paths.

The safe contract now applies identically to source and target:

- Ordinary relative paths still use the existing project-root `Join-Path`,
  including its literal `.`/`..` behavior.
- A single leading slash/backslash uses the project's volume root and is
  normalized with `GetFullPath`. Here `\staging\source` becomes
  `D:\staging\source`, regardless of the caller's drive/directory.
- Drive-relative paths such as `C:staging\source` are rejected with an explicit
  request for an absolute path, before filesystem/service preflight. No per-drive
  current directory is guessed.
- Drive-absolute and UNC paths remain direct, unchanged inputs.

TDD and verification evidence:

- Added regression cases before modifying production source. RED command:
  `node --test scripts/tests/promote-enterprise-build.test.mjs` exited 1.
  The four P2 cases (rooted, rooted parent normalization, drive-relative source,
  drive-relative target) failed in each of four engine/cwd combinations. The
  original seven cases passed in all combinations. A fifth new test initially
  expected dot-segment normalization for ordinary relative paths; its oracle
  was corrected to preserve the existing `Join-Path` behavior, without changing
  that production behavior. Initial total: 28 passes, 24 failures including
  four parent tests and four dot-case assertion failures.
- GREEN: focused suite exited 0 with 52 passes, zero failures/skips: 12 cases
  plus one parent test for each of Windows PowerShell and PowerShell 7, from
  both OS temp on C: and the project directory on D:.
- Both engines parse the full production script for syntax and execute only
  its three path assignments. Updated the isolated harness method allowlist
  for static Path `GetFullPath`/`GetPathRoot` and the exact `Substring(1)` calls.
  No production promotion script invocation/dot-sourcing occurs.
- `node --check scripts/tests/promote-enterprise-build.test.mjs` and scoped
  `git diff --check` exited 0. Git reported expected LF-to-CRLF conversion
  warnings, not whitespace errors.
- Static comparison against pre-fix HEAD confirms all source outside the
  path resolver block is unchanged, including parameters, preflight,
  ShouldProcess, service control, copy, health checks, and output.

Result: the isolated resolver contract passes with synthetic path strings in
both local engines and on both caller drives. This is not a real promotion
end-to-end test. Build/share existence, copying, actual promotion, restart,
batch/delete, provider, Xerox, and OCR were not exercised. No dependencies,
infrastructure, or other tracked/untracked work were changed for this fix.
