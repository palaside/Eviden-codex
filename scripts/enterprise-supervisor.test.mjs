import assert from "node:assert/strict";
import test from "node:test";
import { createSupervisor, parseSupervisorOptions } from "./enterprise-supervisor.mjs";

test("supervisor defaults to the enterprise runtime and port 3450", () => {
  assert.deepEqual(parseSupervisorOptions([], {}), {
    port: 3450,
    nextArgs: [],
    healthIntervalMs: 5000,
    startupGraceMs: 15000,
    maxRestarts: 3,
  });
});

test("supervisor restarts a child after a failed health check", async () => {
  const events = [];
  const children = [];
  const spawnProcess = (command, args, options) => {
    void command;
    void args;
    void options;
    const listeners = new Map();
    const child = {
      pid: children.length + 100,
      once(event, listener) { listeners.set(event, listener); },
      kill(signal) { events.push({ type: "kill", signal }); listeners.get("exit")?.(1, signal); },
    };
    children.push(child);
    return child;
  };
  let healthChecks = 0;
  const supervisor = createSupervisor({
    spawnProcess,
    check: async () => { healthChecks += 1; return false; },
    logger: { info: () => {}, warn: (message) => events.push({ type: "warn", message }), error: () => {} },
  });
  const handle = await supervisor({ port: 3450, nextArgs: [], healthIntervalMs: 1, startupGraceMs: 0, maxRestarts: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  handle.stop();
  assert.ok(healthChecks > 0);
  assert.equal(children.length, 2);
  assert.ok(events.some((event) => event.type === "kill"));
});
