import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULTS = Object.freeze({
  healthIntervalMs: 5_000,
  startupGraceMs: 15_000,
  maxRestarts: 3,
});

export function parseSupervisorOptions(args = process.argv.slice(2), environment = process.env) {
  const portIndex = args.indexOf("--port");
  const port = Number(portIndex >= 0 ? args[portIndex + 1] : environment.PORT || 3450);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);
  return {
    port,
    nextArgs: args,
    healthIntervalMs: Number(environment.SUPERVISOR_HEALTH_INTERVAL_MS || DEFAULTS.healthIntervalMs),
    startupGraceMs: Number(environment.SUPERVISOR_STARTUP_GRACE_MS || DEFAULTS.startupGraceMs),
    maxRestarts: Number(environment.SUPERVISOR_MAX_RESTARTS || DEFAULTS.maxRestarts),
  };
}

export function checkHealth(port, timeoutMs = 2_000) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/", timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => { request.destroy(); resolve(false); });
  });
}

export function createSupervisor({ spawnProcess = spawn, check = checkHealth, logger = console } = {}) {
  return async function supervise(options) {
    const startScript = path.resolve("scripts", "start-enterprise.mjs");
    let restartCount = 0;
    let stopping = false;
    let child;
    let healthTimer;
    let graceTimer;

    const clearTimers = () => {
      if (healthTimer) clearInterval(healthTimer);
      if (graceTimer) clearTimeout(graceTimer);
    };
    const stop = (signal = "SIGTERM") => {
      stopping = true;
      clearTimers();
      child?.kill(signal);
    };
    const start = () => {
      child = spawnProcess(process.execPath, [startScript, ...options.nextArgs], {
        stdio: "inherit",
        env: { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || "build-output-enterprise" },
      });
      logger.info(`[enterprise-supervisor] started child pid=${child.pid} port=${options.port}`);
      graceTimer = setTimeout(() => {
        healthTimer = setInterval(async () => {
          if (!(await check(options.port))) {
            logger.warn(`[enterprise-supervisor] health check failed; restarting (attempt ${restartCount + 1}/${options.maxRestarts})`);
            clearTimers();
            child.kill("SIGTERM");
          }
        }, options.healthIntervalMs);
      }, options.startupGraceMs);
      child.once("exit", (code, signal) => {
        clearTimers();
        if (stopping) return;
        if (restartCount >= options.maxRestarts) {
          logger.error(`[enterprise-supervisor] restart limit reached (${options.maxRestarts}); halting`);
          process.exitCode = 1;
          return;
        }
        restartCount += 1;
        logger.warn(`[enterprise-supervisor] child exited code=${code ?? "-"} signal=${signal ?? "-"}; restarting`);
        start();
      });
    };

    process.once("SIGINT", () => stop("SIGINT"));
    process.once("SIGTERM", () => stop("SIGTERM"));
    start();
    return { stop: () => stop("SIGTERM") };
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const options = parseSupervisorOptions();
  await createSupervisor()(options);
}
