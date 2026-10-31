import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout } from "./fetch-with-timeout.mjs";

test("aborts a stalled enhancement request so the caller can fall back to the original", async () => {
  const result = await fetchWithTimeout("/api/derived-image/upscayl", {}, {
    timeoutMs: 5,
    fetchImpl: (_input, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  }).catch((error) => error);

  assert.equal(result.name, "AbortError");
});
