import { spawnSync } from "node:child_process";
import { access, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveEnterpriseTarget(environment = process.env) {
  return environment.NEXT_DIST_DIR || "build-output-enterprise";
}

export function buildEnterpriseEnvironment(environment = process.env) {
  const buildEnvironment = { ...environment };
  // Next 16 on Windows can fail while creating nested custom distDir folders
  // with EPERM. Build in the standard .next directory, then copy the complete
  // verified artifact to the service target.
  delete buildEnvironment.NEXT_DIST_DIR;
  return buildEnvironment;
}

export async function buildEnterprise() {
  const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
    stdio: "inherit",
    env: buildEnterpriseEnvironment(),
  });
  if ((result.status ?? 1) !== 0) return result.status ?? 1;

  const source = path.resolve(".next");
  const target = path.resolve(resolveEnterpriseTarget());
  if (source.toLowerCase() !== target.toLowerCase()) {
    await cp(source, target, { recursive: true, force: true });
  }
  await access(path.join(target, "BUILD_ID"));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await buildEnterprise());
}
