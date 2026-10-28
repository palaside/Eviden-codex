import assert from "node:assert/strict";
import test from "node:test";
import { mapWithConcurrency } from "../map-with-concurrency.ts";

test("runs tasks with a concurrency limit and preserves input order", async () => {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([30, 5, 15, 1], 2, async (delay, index) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return index;
  });

  assert.equal(peak, 2);
  assert.deepEqual(result, [0, 1, 2, 3]);
});

test("handles empty input without invoking the mapper", async () => {
  let called = false;
  const result = await mapWithConcurrency([], 2, async () => {
    called = true;
  });

  assert.deepEqual(result, []);
  assert.equal(called, false);
});
