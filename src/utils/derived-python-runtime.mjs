import { existsSync } from "node:fs";
import path from "node:path";

export function resolveDerivedImagePython({
  env = process.env,
  platform = process.platform,
  cwd = process.cwd(),
  exists = existsSync,
} = {}) {
  const configured = env.PYTHON_EXECUTABLE || env.PYTHON;
  if (configured) return configured;

  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const executable = platform === "win32"
    ? pathApi.join(cwd, "scripts", ".venv-derived-image", "Scripts", "python.exe")
    : pathApi.join(cwd, "scripts", ".venv-derived-image", "bin", "python");
  return exists(executable) ? executable : "python";
}
