import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

function listWindowsProfiles(root, readDirectory) {
  try {
    return readDirectory(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function resolveExportPython({
  env = process.env,
  platform = process.platform,
  cwd = process.cwd(),
  exists = existsSync,
  profiles,
  readDirectory = readdirSync,
} = {}) {
  const configured = env.PYTHON_EXECUTABLE || env.PYTHON;
  if (configured) return configured;

  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const candidates = platform === "win32"
    ? [
        pathApi.join(cwd, "scripts", ".venv-evidence-export", "Scripts", "python.exe"),
        pathApi.join(cwd, "scripts", ".venv-derived-image", "Scripts", "python.exe"),
        pathApi.join(env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
        ...((profiles || listWindowsProfiles("C:\\Users", readDirectory)).flatMap((profile) => [
          pathApi.join("C:\\Users", profile, "AppData", "Local", "Programs", "Python", "Python312", "python.exe"),
          pathApi.join("C:\\Users", profile, "AppData", "Local", "Programs", "Python", "Python311", "python.exe"),
        ])),
        "C:\\Program Files\\Python312\\python.exe",
      ]
    : [
        pathApi.join(cwd, "scripts", ".venv-derived-image", "bin", "python"),
        "/usr/bin/python3",
        "/usr/local/bin/python3",
      ];

  return candidates.find((candidate) => candidate && exists(candidate)) || "python";
}
