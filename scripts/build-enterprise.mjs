import { spawnSync } from "node:child_process";
import path from "node:path";

const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || "build-output-enterprise" },
});

process.exit(result.status ?? 1);
