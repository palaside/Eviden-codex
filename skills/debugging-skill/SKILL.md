# Debugging Skill

## Purpose
Use this skill to diagnose and fix software bugs systematically. The goal is to identify the root cause, apply the smallest correct fix, and verify that the bug is actually resolved without introducing regressions.

## Core Principle
**Reproduce → Observe → Isolate → Hypothesize → Verify → Fix → Re-test**

Never begin by changing code blindly.

---

## When to Use
Use this skill when:
- A feature behaves incorrectly.
- An error or exception appears.
- A page, API, build, test, or integration fails.
- A regression appears after a recent change.
- Output differs from expected behavior.
- A bug cannot yet be explained.

Do not use this skill for unrelated refactoring, redesign, optimization, or feature development unless they are required to fix the bug.

---

## Required Workflow

### 1. Define the Bug
Record:
- What the user expected.
- What actually happened.
- Exact error messages.
- Steps to reproduce.
- Environment: OS, browser/runtime, framework, package versions.
- Recent changes that may be related.

Use this structure:

```text
Expected:
...

Actual:
...

Steps to reproduce:
1. ...
2. ...
3. ...

Observed error:
...
```

### 2. Reproduce First
Do not attempt a fix until the bug can be reproduced or enough evidence exists to explain why it cannot be reproduced.

If reproduction fails:
- Compare environment differences.
- Check input/data differences.
- Check configuration and environment variables.
- Check race/timing conditions.
- State what remains unknown.

Never invent a root cause when reproduction or evidence is insufficient.

### 3. Collect Evidence
Inspect relevant evidence such as:
- stack traces
- logs
- console errors
- network requests/responses
- failing tests
- browser devtools output
- database errors
- build/type-check errors
- input payloads
- configuration
- git diff / recent commits

Evidence must drive the diagnosis.

### 4. Isolate the Fault Domain
Classify the bug into the smallest likely domain:
- frontend rendering
- client state
- validation
- API boundary
- backend/business logic
- database
- file system/storage
- authentication/authorization
- dependency/configuration
- build/toolchain
- third-party integration

Reduce the search space before editing.

### 5. Form Explicit Hypotheses
Write one or more concrete hypotheses.

Example:
```text
H1: The API returns amount as string but the Zod schema requires number.
H2: The frontend is sending the wrong field name.
H3: The response is valid but stale client state prevents rendering.
```

Rank hypotheses by evidence, not intuition.

### 6. Test One Hypothesis at a Time
Prefer targeted checks:
- log/inspect a specific value
- run a single relevant test
- call one API endpoint
- inspect one function boundary
- compare before/after values

Avoid changing multiple unrelated things at once.

### 7. Identify Root Cause
Do not confuse symptoms with root cause.

Example:
```text
Symptom: Save button does nothing.
Intermediate failure: API returns 422.
Root cause: amount is emitted as a string while schema requires a number.
```

A valid root cause should explain the observed behavior and be supported by evidence.

### 8. Apply the Minimum Correct Fix
Fix the root cause with the smallest viable patch.

Rules:
- Do not refactor unrelated code.
- Do not rename unrelated variables.
- Do not reformat whole files unnecessarily.
- Do not upgrade dependencies unless required.
- Do not change public contracts unless required.
- Do not “clean up” neighboring code opportunistically.

If a broader change is genuinely required, explain why before changing it.

### 9. Verify the Fix
Run the most relevant checks available:
- reproduction steps
- unit tests
- integration tests
- type check
- lint
- build
- targeted manual verification

Confirm both:
1. The original bug is gone.
2. Existing related behavior still works.

### 10. Regression Check
Identify adjacent flows that could be affected.

Examples:
- Same function used by multiple pages.
- Shared schema used by multiple routes.
- Shared component used in multiple screens.
- Shared database field or API contract.

Test those high-risk paths.

---

## Debugging Guardrails

### Never Guess Silently
If evidence is incomplete, state:
```text
Root cause not yet confirmed.
Current evidence supports hypothesis X, but Y remains unverified.
```

### Do Not Hide Existing Failures
If tests/build already fail before your change, record that separately.

### Preserve User Data
Never delete, truncate, reset, or migrate production data just to make a bug disappear unless explicitly required and safely planned.

### Avoid Error Suppression as a Fix
Do not “fix” bugs by:
- swallowing exceptions
- disabling validation
- removing error handling
- replacing failures with silent fallbacks

unless that behavior is explicitly correct.

---

## Recommended Output Before Editing

```text
BUG SUMMARY
- Expected:
- Actual:
- Reproduction:

EVIDENCE
- ...

LIKELY ROOT CAUSE
- ...

FILES/SYMBOLS INVOLVED
- ...

FIX PLAN
- ...

REGRESSION RISKS
- ...
```

---

## Recommended Output After Editing

```text
ROOT CAUSE
...

CHANGES MADE
- file/path: reason

FILES INSPECTED BUT NOT MODIFIED
- file/path

VALIDATION PERFORMED
- test/type-check/build/manual reproduction

RESULT
- Bug resolved / partially resolved / not resolved

REMAINING RISKS
- ...
```

---

## Definition of Done
A debugging task is complete only when:
- The root cause is identified with supporting evidence.
- The fix addresses the root cause rather than only the symptom.
- The original bug no longer reproduces.
- Relevant tests/checks pass or failures are explicitly documented.
- Regression risk has been evaluated.
- Unrelated code has not been modified.
- The final report lists exactly what changed and why.

---

## Short Operating Rule
**Do not guess. Do not shotgun-edit. Prove the cause, patch the cause, verify the result.**
