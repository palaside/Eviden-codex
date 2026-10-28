import assert from "node:assert/strict";
import test from "node:test";
import { fitChatBlock } from "../fit-chat-block.mjs";

test("fits an oversized slice without stretching and keeps it top-aligned", () => {
  const fit = fitChatBlock(807, 1250);
  assert.equal(fit.scale, 1115 / 1250);
  assert.equal(fit.width, 720);
  assert.equal(fit.height, 1115);
  assert.equal(fit.x, 43);
  assert.equal(fit.y, 0);
  assert.ok(Math.abs(fit.width / fit.height - 807 / 1250) < 0.001);
});

test("leaves a normal-height slice at native size", () => {
  assert.deepEqual(fitChatBlock(807, 900), {
    x: 0, y: 0, width: 807, height: 900, scale: 1,
  });
});

test("does not enlarge a narrow slice and centers it horizontally", () => {
  assert.deepEqual(fitChatBlock(400, 900), {
    x: 203, y: 0, width: 400, height: 900, scale: 1,
  });
});

test("fits a small single-page overflow uniformly instead of stretching its height", () => {
  const fit = fitChatBlock(807, 1130);
  assert.equal(fit.height, 1115);
  assert.equal(fit.width, 796);
  assert.equal(fit.x, 5);
  assert.ok(Math.abs(fit.width / fit.height - 807 / 1130) < 0.001);
});

test("rejects invalid geometry", () => {
  assert.throws(() => fitChatBlock(0, 10), RangeError);
  assert.throws(() => fitChatBlock(10, 10, 0, 20), RangeError);
});
