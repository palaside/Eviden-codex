import assert from "node:assert/strict";
import test from "node:test";
import { findExactFileDuplicateGroups } from "./exact-file-duplicates.mjs";
import { computeFileSha256 } from "./forensic-sha256-cache.ts";

test("groups byte-identical files without collapsing their occurrences", () => {
  const groups = findExactFileDuplicateGroups([
    { id: "occ-1", fileName: "chat-a.png", sha256: "same-hash" },
    { id: "occ-2", fileName: "chat-copy.png", sha256: "same-hash" },
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].occurrences.map((item) => item.id), ["occ-1", "occ-2"]);
  assert.deepEqual(groups[0].occurrences.map((item) => item.fileName), ["chat-a.png", "chat-copy.png"]);
});

test("does not classify same-name files with different hashes as duplicates", () => {
  const groups = findExactFileDuplicateGroups([
    { id: "occ-1", fileName: "chat.png", sha256: "hash-a" },
    { id: "occ-2", fileName: "chat.png", sha256: "hash-b" },
  ]);

  assert.deepEqual(groups, []);
});

test("does not group empty hashes", () => {
  const groups = findExactFileDuplicateGroups([
    { id: "occ-1", fileName: "a.png", sha256: "" },
    { id: "occ-2", fileName: "b.png", sha256: "" },
  ]);

  assert.deepEqual(groups, []);
});

test("computes the same local SHA-256 for byte-identical files with different names", async () => {
  const firstFile = new File(["identical source bytes"], "first.png");
  const secondFile = new File(["identical source bytes"], "renamed-copy.png");
  const firstHash = await computeFileSha256(firstFile);
  const secondHash = await computeFileSha256(secondFile);

  assert.equal(firstHash, secondHash);
  assert.equal(firstHash.length, 64);
});

test("computes different hashes when source bytes differ", async () => {
  const firstHash = await computeFileSha256(new File(["source A"], "same-name.png"));
  const secondHash = await computeFileSha256(new File(["source B"], "same-name.png"));

  assert.notEqual(firstHash, secondHash);
});
