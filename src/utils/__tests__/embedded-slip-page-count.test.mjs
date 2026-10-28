import assert from "node:assert/strict";
import test from "node:test";
import { countChatPagesWithEmbeddedSlips } from "../embedded-slip-page-count.mjs";

test("counts only distinct chat pages that contain an embedded slip", () => {
  const result = countChatPagesWithEmbeddedSlips([
    { category: "CHAT", embeddedSlips: [] },
    { category: "CHAT", embeddedSlips: [{ chatPageNumber: 2 }, { chatPageNumber: 2 }] },
    { category: "CHAT", embeddedSlips: [{ chatPageNumber: 3 }] },
    { category: "SLIP", embeddedSlips: [{ chatPageNumber: 1 }] },
  ]);

  assert.equal(result, 2);
});

test("returns zero when chat pages have no embedded slip candidates", () => {
  assert.equal(countChatPagesWithEmbeddedSlips([
    { category: "CHAT", embeddedSlips: [] },
    { category: "CHAT" },
    { category: "SLIP" },
  ]), 0);
});
