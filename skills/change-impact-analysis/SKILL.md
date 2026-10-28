# Change Impact Analysis Skill

## Purpose
Use this skill before changing code when there is uncertainty about what other files, modules, contracts, tests, or runtime behaviors may be affected.

The goal is to understand the blast radius before editing.

## Core Principle
**Analyze broadly before modifying narrowly.**

Reading many files is acceptable. Editing many files is not automatically acceptable.

---

## When to Use
Use this skill when changing:
- shared functions
- shared components
- TypeScript types/interfaces
- Zod schemas
- API request/response formats
- database schema or queries
- shared configuration
- utility modules
- authentication/authorization code
- package versions
- build configuration
- code imported by multiple modules

Also use it whenever the user asks:
- “Will this affect other files?”
- “What else could break?”
- “Check impact before changing it.”

---

## Analysis Dimensions

### 1. Direct Dependencies
Find:
- imports of the target module
- callers of the target function
- consumers of the target component
- usages of the changed type/schema
- routes using the same service

Classify these as **Direct Impact**.

### 2. Indirect Dependencies
Trace one or more levels outward:

```text
Target file
  ↓
Direct consumers
  ↓
Consumers of those consumers
  ↓
Pages / APIs / workflows
```

Classify these as **Indirect Impact**.

Do not edit indirect consumers unless the change actually requires it.

### 3. Shared Contracts
Explicitly identify contracts such as:
- function signatures
- props
- TypeScript interfaces/types
- Zod schemas
- JSON shapes
- API request contracts
- API response contracts
- database column names/types
- event payloads
- environment variable names
- file formats

Contract changes receive higher scrutiny than internal implementation changes.

### 4. Behavioral Dependencies
Look for code that may still compile but behave differently.

Example:
```text
Before: amount = "15000"
After:  amount = 15000
```

Potentially affected code:
```ts
amount.replace(",", "")
```

This is a behavioral impact even if the changed file itself looks valid.

### 5. Runtime Boundaries
Check whether the change crosses:
- browser ↔ server
- frontend ↔ API
- API ↔ database
- app ↔ filesystem
- app ↔ third-party API
- server ↔ queue/cache

Boundary changes tend to have larger blast radius.

---

## Required Workflow

### Step 1: Identify the Proposed Change
Record:
- file
- symbol/function/component/schema
- exact intended behavior change
- whether it changes a shared contract

### Step 2: Search References
Use available code-navigation/search tools to find:
- references
- imports
- callers
- tests
- mocks
- fixtures
- API consumers

Typical tools:
```text
Find All References
Go to References
ripgrep / rg
grep
IDE symbol search
TypeScript language server
```

### Step 3: Build an Impact Map
Use this format:

```text
TARGET
└─ src/schema/slip.ts

DIRECT IMPACT
├─ src/api/slips/extract.ts
├─ src/api/slips/verify.ts
└─ src/components/SlipReview.tsx

INDIRECT IMPACT
├─ src/app/slips/page.tsx
└─ tests/slips/*

CONTRACTS
└─ SlipExtraction.amount: string → number
```

### Step 4: Classify Files
Every relevant file must be placed in one category:

#### MUST CHANGE
The file must change for correctness.

#### VERIFY ONLY
The file is affected or depends on the change but should not be edited unless validation proves it is necessary.

#### OUT OF SCOPE
The file is unrelated to the requested change.

### Step 5: Evaluate Risk
Consider:
- number of consumers
- contract change vs internal change
- public API exposure
- persistence/data migration
- security/auth impact
- third-party integrations
- inability to test downstream consumers

Assign qualitative risk:
```text
Low / Medium / High
```

Do not use risk labels as a substitute for concrete evidence.

### Step 6: Plan Verification
For every high-risk dependency, define a check:

```text
Affected route → integration test
Shared type → type-check/build
Shared component → relevant page test
DB field → migration/query validation
API contract → consumer tests
```

---

## Contract Change Rules

Before modifying a shared contract:
1. Enumerate known consumers.
2. Determine whether backward compatibility is possible.
3. Prefer additive migration when feasible.
4. Avoid removing/renaming fields without a migration plan.
5. Run type-check/build/tests after the change.

Example safer migration:

```json
{
  "amount_raw": "15,000.00",
  "amount": 15000
}
```

may be safer than immediately replacing a widely consumed field.

---

## Important Guardrail

**Inspection permission is not modification permission.**

You may inspect many files to understand impact, but only files proven necessary should be edited.

---

## Required Pre-Change Report

```text
PROPOSED CHANGE
- ...

TARGET FILE/SYMBOL
- ...

DIRECT IMPACT
- ...

INDIRECT IMPACT
- ...

SHARED CONTRACTS
- ...

MUST CHANGE
- ...

VERIFY ONLY
- ...

OUT OF SCOPE
- ...

RISK
- ...

VERIFICATION PLAN
- ...
```

---

## Required Post-Change Report

```text
FILES MODIFIED
- path: reason

FILES VERIFIED ONLY
- path: verification performed

CONTRACT CHANGES
- none / details

TESTS/CHECKS
- ...

REGRESSION RISKS
- ...
```

---

## Definition of Done
Impact analysis is complete when:
- Direct consumers are identified.
- Relevant indirect consumers are identified.
- Shared contracts are explicitly documented.
- Files are classified into MUST CHANGE / VERIFY ONLY / OUT OF SCOPE.
- Verification is planned for affected workflows.
- No unrelated files are modified merely because they were discovered during inspection.

---

## Short Operating Rule
**Read the blast radius. Map the contracts. Change only what correctness requires.**
