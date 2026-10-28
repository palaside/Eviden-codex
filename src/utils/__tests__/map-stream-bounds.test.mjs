import assert from "node:assert/strict";
import test from "node:test";
import { mapStreamBoundsToSources } from "../map-stream-bounds.ts";

const segments = [
  { sourceItemId: "a", sourceFileName: "chat-1.png", sourceSha256: "a1", streamStartY: 0, streamEndY: 100, sourceOffsetY: 0, sourceScale: 2 },
  { sourceItemId: "b", sourceFileName: "chat-2.png", sourceSha256: "b1", streamStartY: 80, streamEndY: 180, sourceOffsetY: 20, sourceScale: 1.5 },
];

test("maps a stream region to its original file pixels and accounts for trimmed overlap", () => {
  const result = mapStreamBoundsToSources({ x: 10, y: 110, width: 20, height: 20 }, segments);
  assert.equal(result.primary.sourceItemId, "b");
  assert.deepEqual(result.primary.sourceBounds, { x: 15, y: 75, width: 30, height: 30 });
  assert.equal(result.crossesSourceBoundary, false);
});

test("keeps both original references when a region crosses a stitched source boundary", () => {
  const result = mapStreamBoundsToSources({ x: 10, y: 90, width: 20, height: 20 }, segments);
  assert.equal(result.crossesSourceBoundary, true);
  assert.deepEqual(result.sources.map((source) => source.sourceItemId), ["b", "a"]);
});

test("preserves capture-time provenance on mapped source references", () => {
  const result = mapStreamBoundsToSources(
    { x: 10, y: 10, width: 20, height: 20 },
    [{ ...segments[0], captureTime: "2025-06-09T14:45:00" }],
  );
  assert.equal(result.primary.captureTime, "2025-06-09T14:45:00");
});
