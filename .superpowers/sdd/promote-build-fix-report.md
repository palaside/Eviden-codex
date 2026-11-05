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

No blocker remains for the requested script-contract scope. Actual promotion and
service health remain untested by explicit instruction.
