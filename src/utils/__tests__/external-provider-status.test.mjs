import assert from "node:assert/strict";
import test from "node:test";
import { classifyExternalProviderStatus } from "../external-provider-status.mjs";

test("marks temporary provider failures as retryable", () => {
  assert.deepEqual(classifyExternalProviderStatus(503), { provider_status: 503, retryable: true });
  assert.deepEqual(classifyExternalProviderStatus(429), { provider_status: 429, retryable: true });
});

test("does not mark validation failures as retryable", () => {
  assert.deepEqual(classifyExternalProviderStatus(422), { provider_status: 422, retryable: false });
});
