import assert from "node:assert/strict";
import test from "node:test";
import { buildEnterpriseEnvironment, resolveEnterpriseTarget } from "./build-enterprise.mjs";

test("builds with Next's standard output and promotes to the requested enterprise target", () => {
  const environment = buildEnterpriseEnvironment({ NODE_ENV: "production", NEXT_DIST_DIR: "stale-target" });
  assert.equal(environment.NEXT_DIST_DIR, undefined);
  assert.equal(environment.NODE_ENV, "production");
  assert.equal(resolveEnterpriseTarget({ NEXT_DIST_DIR: "build-output-test" }), "build-output-test");
});
