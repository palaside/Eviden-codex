# Scoped Bug Fix Skill

## Purpose
Use this skill when a bug must be fixed completely while strictly limiting code changes to the root cause and files that are technically necessary.

This skill combines debugging discipline with strict modification boundaries.

## Core Principle
**Analyze broadly. Modify narrowly. Fix the root cause. Stop when the requested bug is resolved.**

---

## Primary Rule
You may inspect any relevant file needed to understand the issue.

You may modify only files classified as **MUST CHANGE**.

A file must not be edited simply because:
- it could be cleaner
- its naming could improve
- formatting is inconsistent
- another unrelated warning exists
- refactoring would be aesthetically preferable
- an adjacent feature could be modernized

No opportunistic refactoring.

---

## When to Use
Use this skill when the user requests:
- “Fix only this bug.”
- “Do not touch unrelated code.”
- “Check other files, but only modify what is necessary.”
- “Make the smallest possible fix.”
- “Do not refactor the project.”

---

## Required Workflow

### Phase 1: Diagnose
1. Reproduce or verify the reported bug.
2. Collect logs/errors/evidence.
3. Identify the root cause.
4. Inspect dependencies and consumers.
5. Determine whether the root cause can be fixed locally.

Do not edit before this phase has enough evidence.

### Phase 2: Impact Classification
Classify every relevant file as:

#### MUST CHANGE
Modification is required to fix the root cause or keep the system valid after the fix.

#### VERIFY ONLY
The file may be affected, but no edit is currently justified.

#### OUT OF SCOPE
The file is unrelated to the requested bug.

Example:

```text
MUST CHANGE
- src/schemas/slip.schema.ts

VERIFY ONLY
- src/app/api/slips/extract/route.ts
- src/components/SlipReview.tsx

OUT OF SCOPE
- src/components/Navbar.tsx
- src/styles/theme.ts
```

### Phase 3: Prove Why Each File Must Change
Before editing any file, answer:

```text
Why must this file change?
What fails if it does not change?
Is there a smaller local fix?
```

If these questions cannot be answered, do not edit the file yet.

### Phase 4: Apply Minimal Patch
Patch only the minimum lines required.

Rules:
- Prefer local logic correction over broad refactor.
- Preserve existing API/contracts unless changing them is unavoidable.
- Do not rename unrelated identifiers.
- Do not reorder imports unless required by tooling.
- Do not format untouched sections.
- Do not move files.
- Do not reorganize folders.
- Do not upgrade dependencies.
- Do not change UI styling unless the bug concerns styling.
- Do not fix unrelated lint warnings.
- Do not add abstractions unless required to fix correctness.

### Phase 5: Validate
Run checks relevant to the modified area:
- exact reproduction
- targeted tests
- type check
- lint where relevant
- build if applicable
- downstream consumer checks

### Phase 6: Stop Condition
Stop modifying code when:
- the reported bug is fixed
- required validation passes
- known affected consumers remain valid

Do not continue improving unrelated code after the stop condition is reached.

---

## Strict Modification Policy

### Allowed
- Fixing the root-cause line/function.
- Updating a directly dependent file only when the fix changes a required contract.
- Adding/updating a targeted test for the reported bug.
- Adding minimal validation needed to prevent recurrence.

### Not Allowed Without Explicit Need
- broad refactoring
- folder restructuring
- code style cleanup
- dependency upgrades
- UI redesign
- renaming public APIs
- changing database models unrelated to the bug
- replacing libraries
- “while we are here” improvements

---

## Unrelated Problems Discovered During Debugging
If another issue is found:

Do not fix it.

Report it as:

```text
UNRELATED ISSUE DETECTED — NOT MODIFIED
- File:
- Observation:
- Why it is outside scope:
```

Only address it if the user explicitly expands scope or it blocks the requested fix.

---

## Contract Safety
If a fix appears to require changing a shared contract:
- identify all known consumers first
- verify whether an internal/local adaptation can avoid the shared change
- prefer backward-compatible additive changes when feasible
- modify consumers only when correctness requires it

Do not silently change:
- schema fields
- response shapes
- function signatures
- component props
- DB column semantics

---

## Required Pre-Edit Report

```text
BUG
- Expected:
- Actual:
- Reproduction:

ROOT CAUSE
- ...

FILES INSPECTED
- ...

MUST CHANGE
- ...

VERIFY ONLY
- ...

OUT OF SCOPE
- ...

MINIMAL PATCH PLAN
- ...
```

---

## Required Post-Edit Report

```text
ROOT CAUSE FIXED
- ...

FILES MODIFIED
- path
  - exact reason
  - affected symbol/function

FILES VERIFIED BUT NOT MODIFIED
- path

UNRELATED ISSUES FOUND
- none / details

VALIDATION
- reproduction test
- targeted tests
- type-check
- build/lint where relevant

REGRESSION RISK
- ...

SCOPE CONFIRMATION
- No unrelated code was modified.
```

---

## Failure Handling
If the minimal patch does not fix the bug:
1. Revert or reassess the failed hypothesis.
2. Do not stack unrelated edits on top of an unproven fix.
3. Update the impact map.
4. Test the next evidence-backed hypothesis.

Avoid “shotgun debugging”.

---

## Definition of Done
The scoped bug fix is complete when:
- Root cause is identified.
- Only necessary files are changed.
- Modified files have an explicit necessity rationale.
- The original bug no longer reproduces.
- Relevant downstream behavior is verified.
- No unrelated refactor or cleanup was performed.
- Any unrelated issues discovered were reported but not changed.
- Final output lists exactly what was modified and why.

---

## Short Operating Rule
**Read many files if necessary. Edit as few files as possible. No proof of necessity = no edit.**
