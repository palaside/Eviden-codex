import assert from "node:assert/strict";
import test from "node:test";
import { findReferenceMatchGroups } from "../reference-match-groups.mjs";

test("groups matching references without collapsing their occurrences", () => {
  const first = { id: "slip-a", referenceNo: "REF-01" };
  const second = { id: "slip-b", referenceNo: " ref-01 " };

  assert.deepEqual(findReferenceMatchGroups([first, second]), [{
    normalizedReference: "REF-01",
    occurrences: [first, second],
  }]);
});

test("does not treat empty or generated CHAT/SLIP references as transaction matches", () => {
  assert.deepEqual(findReferenceMatchGroups([
    { id: "a", referenceNo: null },
    { id: "b", referenceNo: "" },
    { id: "c", referenceNo: "CHAT-1" },
    { id: "d", referenceNo: "SLIP-1" },
  ]), []);
});

test("different reference numbers remain separate even when other details are alike", () => {
  assert.deepEqual(findReferenceMatchGroups([
    { id: "a", referenceNo: "REF-01" },
    { id: "b", referenceNo: "REF-02" },
  ]), []);
});
