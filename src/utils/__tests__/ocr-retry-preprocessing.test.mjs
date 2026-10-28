import assert from "node:assert/strict";
import test from "node:test";
import { createFieldRetryCanvas } from "../ocr-retry-preprocessing.mjs";

test("SLIP field retries use morphology preprocessing only", async () => {
  const original = {};
  const morphological = {};
  let calls = [];
  const result = await createFieldRetryCanvas(original, "SLIP", {
    morphology: async (canvas) => { calls.push(["morphology", canvas]); return morphological; },
    colorSeparation: async (canvas) => { calls.push(["color", canvas]); return {}; },
  });

  assert.deepEqual(calls, [["morphology", original]]);
  assert.equal(result.canvas, morphological);
  assert.equal(result.method, "morphology");
  assert.equal(result.fallbackUsed, false);
});

test("CHAT field retries keep the color-separation preprocessing path", async () => {
  const original = {};
  const separated = {};
  let calls = [];
  const result = await createFieldRetryCanvas(original, "CHAT", {
    morphology: async (canvas) => { calls.push(["morphology", canvas]); return {}; },
    colorSeparation: async (canvas) => { calls.push(["color", canvas]); return separated; },
  });

  assert.deepEqual(calls, [["color", original]]);
  assert.equal(result.canvas, separated);
  assert.equal(result.method, "color-separation");
  assert.equal(result.fallbackUsed, false);
});

test("failed OpenCV preprocessing falls back to the enhanced source canvas", async () => {
  const original = {};
  const result = await createFieldRetryCanvas(original, "SLIP", {
    morphology: async () => { throw new Error("OpenCV unavailable"); },
    colorSeparation: async () => ({}),
  });

  assert.equal(result.canvas, original);
  assert.equal(result.method, "morphology");
  assert.equal(result.fallbackUsed, true);
});
