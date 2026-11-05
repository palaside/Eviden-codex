import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function buildStartEnvironment(environment = process.env) {
  return {
    ...environment,
    NEXT_DIST_DIR: environment.NEXT_DIST_DIR || "build-output-enterprise",
  };
}

export function buildStartArgs(args = []) {
  const hasHostname = args.some((arg, index) => arg === "-H" || arg === "--hostname" || arg.startsWith("--hostname="));
  return hasHostname ? [...args] : ["-H", "127.0.0.1", ...args];
}

function run() {
  const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", ...buildStartArgs(process.argv.slice(2))], {
    stdio: "inherit",
    env: buildStartEnvironment(),
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run();
}
