import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const port = 3455;
const outDir = path.resolve(root, "For Test Results", "enterprise-supervisor-process-3455");
const report = { port, steps: [], passed: false };
const child = spawn(process.execPath, [path.resolve(root, "scripts", "enterprise-supervisor.mjs"), "--port", String(port)], {
  cwd: root,
  env: { ...process.env, SUPERVISOR_HEALTH_INTERVAL_MS: "500", SUPERVISOR_STARTUP_GRACE_MS: "1000", SUPERVISOR_MAX_RESTARTS: "2" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function waitFor(check, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function healthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_500) });
    return response.status === 200;
  } catch {
    return false;
  }
}

try {
  assert.equal(await waitFor(healthy), true, "supervised runtime did not become healthy");
  const started = output.match(/started child pid=(\d+)/);
  assert.ok(started, `child pid not present in supervisor output: ${output}`);
  const firstPid = Number(started[1]);
  report.steps.push({ name: "initial-health", ok: true, childPid: firstPid });

  process.kill(firstPid, "SIGTERM");
  assert.equal(await waitFor(async () => {
    const healthyNow = await healthy();
    return healthyNow && (output.match(/started child pid=(\d+)/g) || []).length >= 2;
  }), true, "supervisor did not restart the child");
  const startedPids = [...output.matchAll(/started child pid=(\d+)/g)].map((match) => Number(match[1]));
  report.steps.push({ name: "child-restart", ok: true, firstPid, restartedPid: startedPids.at(-1) });
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.stack || error.message : String(error);
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ outDir, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
