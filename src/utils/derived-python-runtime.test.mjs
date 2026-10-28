import test from "node:test";
import assert from "node:assert/strict";
import { resolveDerivedImagePython } from "./derived-python-runtime.mjs";

test("respects an explicitly configured Python executable", () => {
  assert.equal(resolveDerivedImagePython({
    env: { PYTHON_EXECUTABLE: "custom-python", PYTHON: "other-python" },
    platform: "win32",
    cwd: "D:/project",
    exists: () => false,
  }), "custom-python");
});

test("uses the task-specific venv when it exists", () => {
  assert.equal(resolveDerivedImagePython({
    env: {},
    platform: "win32",
    cwd: "D:\\project",
    exists: (path) => path === "D:\\project\\scripts\\.venv-derived-image\\Scripts\\python.exe",
  }), "D:\\project\\scripts\\.venv-derived-image\\Scripts\\python.exe");
});

test("falls back to PATH Python when the task-specific venv is absent", () => {
  assert.equal(resolveDerivedImagePython({
    env: {},
    platform: "linux",
    cwd: "/project",
    exists: () => false,
  }), "python");
});
