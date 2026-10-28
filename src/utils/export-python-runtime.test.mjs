import assert from "node:assert/strict";
import { resolveExportPython } from "./export-python-runtime.mjs";

const resolved = resolveExportPython({
  platform: "win32",
  cwd: "D:\\Project\\Digital Evi - Codex",
  env: { USERPROFILE: "C:\\Windows\\system32\\config\\systemprofile" },
  profiles: ["EVE"],
  exists: (candidate) => candidate === "C:\\Users\\EVE\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
});

assert.equal(resolved, "C:\\Users\\EVE\\AppData\\Local\\Programs\\Python\\Python312\\python.exe");
assert.equal(resolveExportPython({
  platform: "win32",
  cwd: "D:\\Project\\Digital Evi - Codex",
  exists: (candidate) => candidate === "D:\\Project\\Digital Evi - Codex\\scripts\\.venv-evidence-export\\Scripts\\python.exe",
}), "D:\\Project\\Digital Evi - Codex\\scripts\\.venv-evidence-export\\Scripts\\python.exe");
assert.equal(resolveExportPython({ env: { PYTHON_EXECUTABLE: "configured-python" }, exists: () => false }), "configured-python");

console.log("PASS: export runtime resolves Python for LocalSystem service context.");
