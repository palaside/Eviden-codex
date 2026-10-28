const assert = require("node:assert/strict");
const path = require("node:path");
const { createServiceOptions, cleanupStaleDaemonArtifacts } = require("./install-enterprise-node-service.cjs");

const root = path.resolve(__dirname, "..");
const options = createServiceOptions({ root, port: 3450 });

assert.equal(options.name, "DigitalEvidenceEnterprise");
assert.equal(options.description, "Digital Evidence Enterprise");
assert.equal(options.script, path.join(root, "scripts", "enterprise-supervisor.mjs"));
assert.equal(options.scriptOptions, "--port 3450");
assert.equal(options.workingDirectory, root);
assert.ok(options.env.some((item) => item.name === "PORT" && item.value === "3450"));
assert.ok(options.env.some((item) => item.name === "NEXT_DIST_DIR" && item.value === "build-output-enterprise"));
assert.ok(options.env.some((item) => item.name === "PYTHON_EXECUTABLE" && item.value));
assert.equal(typeof cleanupStaleDaemonArtifacts, "function");

console.log("PASS: node-windows service configuration is source-of-truth safe.");
