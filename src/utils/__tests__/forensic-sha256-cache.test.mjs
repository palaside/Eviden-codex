import assert from "node:assert/strict";
import test from "node:test";
import { clearAllSlipCache, getCachedSlip, parseCachedSlipEntry, serializeCachedSlipEntry, setCachedSlip } from "../forensic-sha256-cache.ts";
import { EXTRACTION_VERSION } from "../extraction-version.mjs";

test("ignores legacy unversioned extraction cache payloads", () => {
  assert.equal(parseCachedSlipEntry(JSON.stringify({ transaction: { amount: 7200 } })), null);
  assert.equal(parseCachedSlipEntry(JSON.stringify({ extractionVersion: EXTRACTION_VERSION - 1, data: { transaction: { amount: 7200 } } })), null);
});

test("reads and writes extraction cache entries with the current version", () => {
  const slip = { transaction: { amount: 3000 } };
  clearAllSlipCache();
  setCachedSlip("current-hash", slip);

  assert.deepEqual(getCachedSlip("current-hash"), slip);
  const stored = JSON.parse(serializeCachedSlipEntry(slip));
  assert.equal(stored.extractionVersion, EXTRACTION_VERSION);
  assert.deepEqual(parseCachedSlipEntry(JSON.stringify(stored)).data, slip);
  clearAllSlipCache();
});
