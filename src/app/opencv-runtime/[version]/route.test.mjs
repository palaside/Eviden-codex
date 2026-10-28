import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route.ts";

test("serves the pinned OpenCV browser runtime as JavaScript", async () => {
  const response = await GET(
    new Request("http://localhost/opencv-runtime/5.0.0-release.1"),
    { params: Promise.resolve({ version: "5.0.0-release.1" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok((await response.arrayBuffer()).byteLength > 10_000_000);
});

test("does not serve an unpinned OpenCV runtime version", async () => {
  const response = await GET(
    new Request("http://localhost/opencv-runtime/unpinned"),
    { params: Promise.resolve({ version: "unpinned" }) },
  );

  assert.equal(response.status, 404);
});
