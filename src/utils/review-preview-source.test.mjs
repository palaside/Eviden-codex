import assert from "node:assert/strict";
import test from "node:test";
import { getReviewPreviewSource } from "./review-preview-source.mjs";

test("review prefers the derived preview while preserving the original fallback", () => {
  assert.equal(
    getReviewPreviewSource({ previewUrl: "blob:original", reviewPreviewUrl: "data:image/png;base64,derived" }),
    "data:image/png;base64,derived",
  );
  assert.equal(getReviewPreviewSource({ previewUrl: "blob:original" }), "blob:original");
});
