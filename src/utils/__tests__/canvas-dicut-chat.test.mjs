import assert from "node:assert/strict";
import test from "node:test";
import { applyFeatherBlendSeam, findQuietCutBands, isTinySinglePageOverflow, selectQuietCut } from "../canvas-dicut-chat.ts";

test("feather seam blends exactly the 12px band specified by Dicut_Chat", () => {
  const calls = [];
  const gradient = { addColorStop: (...args) => calls.push(["stop", ...args]) };
  const context = {
    createLinearGradient: (...args) => {
      calls.push(["gradient", ...args]);
      return gradient;
    },
    fillRect: (...args) => calls.push(["fillRect", ...args]),
  };

  applyFeatherBlendSeam(context, 807, 100, { r: 12, g: 34, b: 56 });

  assert.deepEqual(calls[0], ["gradient", 0, 88, 0, 100]);
  assert.deepEqual(calls[3], ["fillRect", 0, 88, 807, 12]);
});

test("recognizes a small overflow that should be fitted onto one A4 page", () => {
  assert.equal(isTinySinglePageOverflow(1120), true);
});

test("keeps normal pages and materially long captures on the slicing path", () => {
  assert.equal(isTinySinglePageOverflow(1115), false);
  assert.equal(isTinySinglePageOverflow(1172), false);
});

test("requires six consecutive quiet rows before selecting a safe cut band", () => {
  const rows = Array(24).fill(false);
  rows.fill(true, 2, 7);
  rows.fill(true, 12, 18);

  assert.deepEqual(findQuietCutBands(rows, rows.length), [14]);
});

test("pulls to the first quiet band after the target and shrinks the slice", () => {
  const quietRows = Array(2500).fill(false);
  quietRows.fill(true, 1198, 1204);
  assert.deepEqual(selectQuietCut(0, 2500, [1200], quietRows), {
    cutPoint: 1200,
    shouldShrink: true,
    forcedThroughContent: false,
  });
});

test("pushes the cut to the last quiet band before the target when lookahead is unavailable", () => {
  const quietRows = Array(2500).fill(false);
  quietRows.fill(true, 1000, 1006);
  quietRows.fill(true, 1050, 1056);
  assert.deepEqual(selectQuietCut(0, 2500, [1000, 1050], quietRows), {
    cutPoint: 1050,
    shouldShrink: false,
    forcedThroughContent: false,
  });
});

test("marks the fallback when no quiet row exists near the target", () => {
  assert.deepEqual(selectQuietCut(0, 2500, [], Array(2500).fill(false)), {
    cutPoint: 1115,
    shouldShrink: false,
    forcedThroughContent: true,
  });
});

test("never selects a quiet candidate in the trimmed bottom edge", () => {
  const quietRows = Array(1300).fill(false);
  quietRows[1230] = true;
  const result = selectQuietCut(0, 1200, [1230], quietRows);

  assert.ok(result.cutPoint <= 1200);
});

test("does not warn when a forced cut lands exactly at the final trimmed edge", () => {
  const result = selectQuietCut(0, 1115, [], Array(1115).fill(false));

  assert.equal(result.cutPoint, 1115);
  assert.equal(result.forcedThroughContent, false);
});
