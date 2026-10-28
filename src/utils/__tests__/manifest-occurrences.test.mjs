import assert from "node:assert/strict";
import test from "node:test";
import { appendUniqueManifestOccurrences } from "../manifest-occurrences.mjs";

const entry = (file_name, sha256, no = 1) => ({
  no,
  file_name,
  file_type: "SLIP",
  size_bytes: 123,
  sha256,
  intake_timestamp: "2026-10-08T00:00:00.000Z",
});

test("does not append the same filename and SHA occurrence on repeated processing", () => {
  const original = [entry("proof.png", "abc")];
  const result = appendUniqueManifestOccurrences(original, [entry("proof.png", "abc")]);
  assert.equal(result.length, 1);
  assert.equal(original.length, 1);
});

test("preserves same-content evidence when it has a different source filename", () => {
  const result = appendUniqueManifestOccurrences(
    [entry("proof-a.png", "abc")],
    [entry("proof-b.png", "abc")],
  );
  assert.deepEqual(result.map(({ file_name, no }) => ({ file_name, no })), [
    { file_name: "proof-a.png", no: 1 },
    { file_name: "proof-b.png", no: 2 },
  ]);
});

test("filters duplicate additions but does not rewrite duplicates already in saved history", () => {
  const original = [entry("proof.png", "abc"), entry("proof.png", "abc", 2)];
  const result = appendUniqueManifestOccurrences(original, [entry("proof.png", "abc")]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.slice(0, 2), original);
});
