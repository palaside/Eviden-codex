import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PHASH_MAX_DISTANCE,
  findSimilarImagePairs,
  hammingDistance64,
  perceptualHashFromGrayscale,
} from "../perceptual-image-similarity.ts";

test("pHash keeps a slight brightness shift within the provisional review threshold", () => {
  const pixels = Float32Array.from({ length: 32 * 32 }, (_, index) => ((index * 73 + Math.floor(index / 7) * 19) % 150) + 40);
  const shifted = Float32Array.from(pixels, (value) => value + 8);

  assert.ok(
    hammingDistance64(perceptualHashFromGrayscale(pixels, 32, 32), perceptualHashFromGrayscale(shifted, 32, 32))
      <= DEFAULT_PHASH_MAX_DISTANCE,
  );
});

test("similar-pair detection is review-only data and preserves every occurrence", () => {
  const pairs = findSimilarImagePairs([
    { id: "a", hash: "0000000000000000" },
    { id: "b", hash: "0000000000000001" },
    { id: "c", hash: "ffffffffffffffff" },
  ]);

  assert.equal(DEFAULT_PHASH_MAX_DISTANCE, 8);
  assert.deepEqual(pairs, [{ leftId: "a", rightId: "b", distance: 1 }]);
  assert.equal(new Set(pairs.flatMap(({ leftId, rightId }) => [leftId, rightId])).size, 2);
});

test("does not compare missing or malformed hashes", () => {
  assert.deepEqual(findSimilarImagePairs([
    { id: "a", hash: null },
    { id: "b", hash: "bad" },
  ]), []);
});
