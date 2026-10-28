import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessingWarningEntries } from "./processing-warning-entries.mjs";

test("keeps repeated identical warnings as separate stable entries", () => {
  const entries = buildProcessingWarningEntries([
    { id: "source-a", processingWarnings: ["same warning", "same warning"] },
    { id: "source-b", processingWarnings: ["same warning"] },
  ]);

  assert.equal(entries.length, 3);
  assert.equal(new Set(entries.map(({ id }) => id)).size, 3);
  assert.deepEqual(entries.map(({ warning }) => warning), ["same warning", "same warning", "same warning"]);
});
