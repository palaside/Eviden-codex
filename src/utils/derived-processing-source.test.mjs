import assert from "node:assert/strict";
import test from "node:test";
import { selectDerivedProcessingSource } from "./derived-processing-source.mjs";

test("uses the derived file for processing while preserving review-only provenance", () => {
  const original = new File(["original"], "slip.jpg", { type: "image/jpeg" });
  const derived = new File(["derived"], "slip.derived.png", { type: "image/png" });
  const selected = selectDerivedProcessingSource(original, {
    status: "success",
    derivedFile: derived,
    metadata: { sourceSha256: "source", derivedSha256: "derived", engine: "upscayl-ncnn" },
  });

  assert.equal(selected.file, derived);
  assert.equal(selected.sourceKind, "derived");
  assert.equal(selected.reviewOnly, true);
  assert.equal(selected.artifact.engine, "upscayl-ncnn");
  assert.equal(selected.warning, null);
});

test("falls back to the original file when enhancement is unavailable", () => {
  const original = new File(["original"], "slip.jpg", { type: "image/jpeg" });
  const selected = selectDerivedProcessingSource(original, {
    status: "unavailable",
    message: "Upscayl unavailable",
  });

  assert.equal(selected.file, original);
  assert.equal(selected.sourceKind, "original");
  assert.equal(selected.reviewOnly, true);
  assert.match(selected.warning, /Upscayl unavailable/);
});
