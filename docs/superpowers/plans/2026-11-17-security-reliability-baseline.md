# Security and Reliability Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first automated checks for secrets, source-code vulnerabilities, dependency vulnerabilities, and browser/runtime smoke verification without changing application behavior or sending evidence files to third-party scanners.

**Architecture:** GitHub Actions invokes CodeQL, Semgrep, Gitleaks, `npm audit`, TypeScript, ESLint, and Playwright smoke checks as separate jobs. Dependabot checks weekly and creates controlled grouped npm and GitHub Actions update pull requests. A Node contract test validates that the committed workflow configuration preserves the project’s forensic safety constraints.

**Tech Stack:** GitHub Actions, CodeQL, Dependabot, Gitleaks Action, Semgrep Action, Node.js built-in test runner, npm audit, Playwright.

## Global Constraints

- Do not add runtime or development dependencies to `package.json`.
- Do not change OCR, Legal Signal, IndexedDB, LocalStorage, API Vault, evidence records, or UI behavior.
- Scanners must operate on source/configuration and must not upload user evidence images, raw OCR, derived images, or API keys.
- Security findings are review signals; the workflow must not auto-fix or auto-merge changes.
- Keep automated scans read-only except Dependabot pull requests.

---

### Task 1: Write a security-workflow contract test

**Files:**
- Create: `scripts/tests/security-baseline-contract.test.mjs`

**Produces:** A deterministic test that fails until the required CI workflow, Dependabot policy, and scanner exclusions are present.

- [ ] **Step 1: Write the failing test**

Create assertions for `.github/workflows/security-baseline.yml`, `.github/dependabot.yml`, CodeQL JavaScript/TypeScript coverage, Gitleaks, Semgrep, `npm audit --omit=dev`, and evidence-path exclusions.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/tests/security-baseline-contract.test.mjs`

Expected: FAIL because `.github` security configuration does not exist.

### Task 2: Add CI security and reliability workflow

**Files:**
- Create: `.github/workflows/security-baseline.yml`

**Consumes:** The test requirements from Task 1.

**Produces:** Pull-request and scheduled source-only scanning jobs.

- [ ] **Step 1: Implement the minimal workflow**

Create separate least-privilege jobs for CodeQL JavaScript/TypeScript, `npm audit --omit=dev --json`, Semgrep, Gitleaks, and existing TypeScript/ESLint checks. Run the existing Playwright Timeline smoke test only after the staging server is deliberately supplied by CI; do not start or upload evidence data from the security workflow.

- [ ] **Step 2: Add scanner exclusions**

Exclude evidence stores, test images, OCR model data, result artifacts, `.next`, and build outputs from Semgrep/Gitleaks paths so scans inspect code/configuration, not case material.

### Task 3: Add controlled dependency update policy

**Files:**
- Create: `.github/dependabot.yml`

**Produces:** Monthly grouped npm and GitHub Actions update pull requests; no auto-merge.

- [ ] **Step 1: Configure Dependabot**

Set `version: 2`; weekly checks for `npm` at `/` and `github-actions` at `/`; use conservative open-PR limits and group minor/patch updates.

### Task 4: Verify and document the baseline

**Files:**
- Modify: `package.json`

**Produces:** A repeatable `security:baseline` script that runs the Node policy contract and `npm audit --omit=dev` locally.

- [ ] **Step 1: Run the contract test after configuration**

Run: `node --test scripts/tests/security-baseline-contract.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run local checks**

Run: `npm run security:baseline`, `npx tsc --noEmit`, and `npm run lint -- --quiet`.

- [ ] **Step 3: Commit scoped files**

Commit only the workflow, Dependabot config, baseline test, `package.json`, and this plan. Do not stage unrelated OCR/UI or local artifacts.
