import assert from "node:assert/strict";
import test from "node:test";
import { classifyUniqueEvidenceItems } from "../evidence-detection-pipeline.mjs";

test("rechecks filename-classified slips with image signals and skips exact duplicates", async () => {
  const slipNamedChat = { id: "chat-named-slip", category: "SLIP", file: { name: "slip-proof.jpg" } };
  const duplicate = { id: "duplicate", category: "SLIP", isDuplicate: true, file: { name: "copy.jpg" } };
  const calls = [];

  const results = await classifyUniqueEvidenceItems([slipNamedChat, duplicate], async (file) => {
    calls.push(file.name);
    return { category: "CHAT", type: "TYPE_CHAT" };
  });

  assert.deepEqual(calls, ["slip-proof.jpg"]);
  assert.deepEqual(results, [["chat-named-slip", { category: "CHAT", type: "TYPE_CHAT" }]]);
});
