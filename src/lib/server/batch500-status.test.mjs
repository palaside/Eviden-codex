import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBatchCheckpoint } from "./batch500-status.mjs";

test("reports visible running progress without treating review_required as a failure", () => {
  const now = Date.parse("2026-11-06T00:20:00.000Z");
  const status = summarizeBatchCheckpoint({
    updatedAt: "2026-11-06T00:19:30.000Z",
    buildId: "build-1",
    batchStates: { "003": { status: "running" } },
    results: [{ status: "review_required" }, { status: "skipped_duplicate" }, { status: "not_run" }, { status: "failed" }],
  }, now);
  assert.deepEqual(status, {
    state: "running", updatedAt: "2026-11-06T00:19:30.000Z", buildId: "build-1",
    total: 4, terminal: 3, pending: 1, reviewRequired: 1, failed: 1, skippedDuplicate: 1, stopReason: null,
  });
});

test("marks a running checkpoint stale when it stops updating", () => {
  const status = summarizeBatchCheckpoint({
    updatedAt: "2026-11-05T23:00:00.000Z",
    batchStates: { "003": { status: "running" } }, results: [],
  }, Date.parse("2026-11-06T00:20:00.000Z"));
  assert.equal(status.state, "stalled");
});
