import test from "node:test";
import assert from "node:assert/strict";
import { formatCommandFailure } from "./command-failure.mjs";

test("reports a command timeout explicitly instead of presenting a null exit code", () => {
  assert.equal(formatCommandFailure({
    code: null,
    signal: "SIGTERM",
    timedOut: true,
    timeoutMs: 300_000,
    stderr: "",
    stdout: "",
  }), "Command timed out after 300000 ms");
});

test("keeps useful process output for a non-timeout failure", () => {
  assert.equal(formatCommandFailure({
    code: 2,
    signal: null,
    timedOut: false,
    timeoutMs: 300_000,
    stderr: "model missing",
    stdout: "",
  }), "Command failed (2): model missing");
});
