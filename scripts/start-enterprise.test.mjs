import test from "node:test";
import assert from "node:assert/strict";
import { buildStartEnvironment } from "./start-enterprise.mjs";

test("enterprise start defaults to the enterprise build directory", () => {
  const env = buildStartEnvironment({ NODE_ENV: "production" });
  assert.equal(env.NEXT_DIST_DIR, "build-output-enterprise");
});

test("enterprise start preserves an explicitly selected build directory", () => {
  const env = buildStartEnvironment({ NEXT_DIST_DIR: "build-output-enterprise-verify" });
  assert.equal(env.NEXT_DIST_DIR, "build-output-enterprise-verify");
});
