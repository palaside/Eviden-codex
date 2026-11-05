import test from "node:test";
import assert from "node:assert/strict";
import { buildStartArgs, buildStartEnvironment } from "./start-enterprise.mjs";

test("enterprise start binds to the IPv4 loopback used by health checks and E2E", () => {
  assert.deepEqual(buildStartArgs([]), ["-H", "127.0.0.1"]);
});

test("enterprise start preserves an explicitly supplied hostname", () => {
  assert.deepEqual(buildStartArgs(["-H", "::1", "-p", "3450"]), ["-H", "::1", "-p", "3450"]);
});

test("enterprise start defaults to the enterprise build directory", () => {
  const env = buildStartEnvironment({ NODE_ENV: "production" });
  assert.equal(env.NEXT_DIST_DIR, "build-output-enterprise");
});

test("enterprise start preserves an explicitly selected build directory", () => {
  const env = buildStartEnvironment({ NEXT_DIST_DIR: "build-output-enterprise-verify" });
  assert.equal(env.NEXT_DIST_DIR, "build-output-enterprise-verify");
});
