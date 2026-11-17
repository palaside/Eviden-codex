import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const require = createRequire(import.meta.url);

function parseExactVersion(value) {
  const match = String(value).match(/^(?:\^|~)?(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(match, `Expected a simple semver dependency range, received ${value}`);
  return match.slice(1).map(Number);
}

function isAtLeast(actual, minimum) {
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

test("security baseline keeps source-only scanners and required checks configured", () => {
  const workflowPath = ".github/workflows/security-baseline.yml";
  const dependabotPath = ".github/dependabot.yml";
  const gitleaksConfigPath = ".gitleaks.toml";
  const semgrepConfigPath = ".semgrep.yml";

  assert.ok(existsSync(path.join(root, workflowPath)), `${workflowPath} is missing`);
  assert.ok(existsSync(path.join(root, dependabotPath)), `${dependabotPath} is missing`);
  assert.ok(existsSync(path.join(root, gitleaksConfigPath)), `${gitleaksConfigPath} is missing`);
  assert.ok(existsSync(path.join(root, semgrepConfigPath)), `${semgrepConfigPath} is missing`);

  const workflow = read(workflowPath);
  const dependabot = read(dependabotPath);
  const gitleaksConfig = read(gitleaksConfigPath);
  const semgrepConfig = read(semgrepConfigPath);
  const packageJson = JSON.parse(read("package.json"));

  for (const required of [
    "github/codeql-action/init",
    "javascript-typescript",
    "gitleaks/gitleaks-action",
    "semgrep/semgrep-action",
    "npm audit --omit=dev --json",
    "npx tsc --noEmit",
    "npm run lint -- --quiet",
    "contents: read",
  ]) {
    assert.match(workflow, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `workflow is missing ${required}`);
  }

  for (const excludedEvidencePath of ["For Test", "For Test Results", "evidence_store", "RAW", "public/ocr"]) {
    assert.match(gitleaksConfig, new RegExp(excludedEvidencePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Gitleaks must exclude ${excludedEvidencePath}`);
    assert.match(semgrepConfig, new RegExp(excludedEvidencePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Semgrep must exclude ${excludedEvidencePath}`);
  }

  assert.match(dependabot, /package-ecosystem:\s*["']npm["']/);
  assert.match(dependabot, /package-ecosystem:\s*["']github-actions["']/);
  assert.match(dependabot, /open-pull-requests-limit:\s*3/);
  assert.equal(packageJson.scripts["security:baseline"], "node --test scripts/tests/security-baseline-contract.test.mjs && npm audit --omit=dev");
});

test("runtime dependencies meet the audited minimum patched versions", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(
    isAtLeast(parseExactVersion(packageJson.dependencies.next), [16, 4, 6]),
    true,
    "next must be at least 16.4.6 to avoid the audited Next.js advisories",
  );
  assert.equal(
    isAtLeast(parseExactVersion(packageJson.dependencies.zod), [4, 6, 6]),
    true,
    "zod must be at least 4.6.6 to avoid the audited denial-of-service advisory",
  );
  assert.equal(
    packageJson.overrides?.["source-map-js"],
    "1.2.2",
    "source-map-js must be pinned to 1.2.2 to avoid the audited denial-of-service advisory",
  );
});

test("ExcelJS UUID override keeps the v4 CommonJS API available", () => {
  const packageJson = JSON.parse(read("package.json"));
  const { v4 } = require("uuid");

  assert.equal(
    packageJson.overrides?.uuid,
    "11.1.1",
    "uuid must be pinned to 11.1.1 to avoid the audited buffer bounds advisory",
  );
  assert.match(v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
