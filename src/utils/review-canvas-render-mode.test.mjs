import test from "node:test";
import assert from "node:assert/strict";
import { shouldRenderChatSlices } from "./review-canvas-render-mode.mjs";

test("chat original review renders stored chat slices instead of the full source image", () => {
  assert.equal(shouldRenderChatSlices({ isChatMode: true, sourceKind: "original" }), true);
});

test("derived and detected-overlay review keeps its selected artifact renderer", () => {
  assert.equal(shouldRenderChatSlices({ isChatMode: true, sourceKind: "derived" }), false);
  assert.equal(shouldRenderChatSlices({ isChatMode: true, sourceKind: "detected-overlay" }), false);
  assert.equal(shouldRenderChatSlices({ isChatMode: false, sourceKind: "original" }), false);
});
