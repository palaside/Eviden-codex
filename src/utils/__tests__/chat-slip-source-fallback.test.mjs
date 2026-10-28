import assert from "node:assert/strict";
import test from "node:test";
import { mapSourceSlipCandidateToChatSlice } from "../chat-slip-source-fallback.mjs";

test("maps full-source slip coordinates into the containing chat page and preserves OCR boxes", () => {
  const candidate = {
    bounds: { x: 500, y: 1200, width: 180, height: 60 },
    cropDataUrl: "data:image/png;base64,test",
    ocrTextBoxes: [{ text: "3,000 บาท", confidence: 0.95, bounds: { x: 510, y: 1210, width: 100, height: 20 } }],
  };
  const mapped = mapSourceSlipCandidateToChatSlice(candidate, {
    sourceWidth: 828,
    sourceItemId: "chat-1",
    sourceSegments: [{ sourceItemId: "chat-1", streamStartY: 0, streamEndY: 1587, sourceOffsetY: 0, sourceScale: 828 / 807 }],
    slices: [
      { sliceIndex: 1, streamPageNumber: 1, startY: 0, endY: 1115, contentScaleY: 1 },
      { sliceIndex: 2, streamPageNumber: 2, startY: 1115, endY: 1587, contentScaleY: 1 },
    ],
  });

  assert.equal(mapped.sliceIndex, 1);
  assert.equal(mapped.streamPageNumber, 2);
  assert.ok(Math.abs(mapped.candidate.bounds.x - (500 / (828 / 807))) < 0.01);
  assert.ok(Math.abs(mapped.candidate.bounds.y - (1200 / (828 / 807) - 1115)) < 0.01);
  assert.ok(Math.abs(mapped.candidate.ocrTextBoxes[0].bounds.y - mapped.candidate.bounds.y - 10 / (828 / 807)) < 0.01);
});

test("does not map a source candidate onto a page from another source item", () => {
  const mapped = mapSourceSlipCandidateToChatSlice({ bounds: { x: 1, y: 1, width: 10, height: 10 } }, {
    sourceWidth: 828,
    sourceItemId: "chat-1",
    sourceSegments: [{ sourceItemId: "chat-2", streamStartY: 0, streamEndY: 900, sourceOffsetY: 0, sourceScale: 1 }],
    slices: [{ sliceIndex: 1, streamPageNumber: 1, startY: 0, endY: 900, contentScaleY: 1 }],
  });

  assert.equal(mapped, null);
});
