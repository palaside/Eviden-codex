import assert from "node:assert/strict";
import test from "node:test";
import { buildPixelDuplicateWarnings, buildUniquePixelJobPlan, expandUniquePixelJobResults, findPixelIdenticalPageGroups } from "./pixel-identical-pages.mjs";

const page = (id, pixels, width = 2, height = 2) => ({
  id,
  sourceItemId: `source-${id}`,
  fileName: `${id}.png`,
  pageNumber: 1,
  width,
  height,
  readPixels: async () => Uint8ClampedArray.from(pixels),
});

test("groups exact pixel-identical page slices but preserves their occurrence metadata", async () => {
  const pixels = [0, 0, 0, 255, 20, 20, 20, 255, 40, 40, 40, 255, 60, 60, 60, 255];
  const pages = [
    page("a", pixels),
    page("b", pixels),
    page("different", [...pixels.slice(0, -4), 61, 60, 60, 255]),
  ];
  const groups = await findPixelIdenticalPageGroups(pages);
  assert.deepEqual(groups.map((group) => group.map(({ id }) => id)), [["a", "b"]]);
});

test("does not match pages with different dimensions or unreadable pixels", async () => {
  const pixels = [0, 0, 0, 255];
  assert.deepEqual(await findPixelIdenticalPageGroups([
    page("a", pixels, 1, 1),
    page("b", pixels, 2, 1),
    { ...page("c", pixels, 1, 1), readPixels: async () => null },
  ]), []);
});

test("does not classify visually near-identical pixel buffers as exact duplicates", async () => {
  assert.deepEqual(await findPixelIdenticalPageGroups([
    page("a", [0, 0, 0, 0]),
    page("b", [0, 0, 0, 1]),
  ]), []);
});

test("builds a review warning for every exact-pixel occurrence with all source locations", () => {
  const groups = [[
    { sourceItemId: "source-a", fileName: "chat-73.jpg", pageNumber: 1 },
    { sourceItemId: "source-a", fileName: "chat-73.jpg", pageNumber: 2 },
    { sourceItemId: "source-b", fileName: "chat-77.jpg", pageNumber: 1 },
  ]];
  const warnings = buildPixelDuplicateWarnings(groups);

  assert.equal(warnings.length, 3);
  assert.deepEqual(warnings.map(({ sourceItemId }) => sourceItemId), ["source-a", "source-a", "source-b"]);
  assert.ok(warnings.every(({ warning }) => warning.includes("chat-73.jpg · หน้า 1")
    && warning.includes("chat-73.jpg · หน้า 2")
    && warning.includes("chat-77.jpg · หน้า 1")
    && warning.includes("ใช้ผล QR/OCR ร่วมกัน")
    && warning.includes("ไม่ตัดหลักฐาน")));
});

test("plans one QR/OCR job per exact-pixel group and maps the result to every occurrence", () => {
  const jobs = [
    { id: "a:0", page: 1 },
    { id: "b:2", page: 3 },
    { id: "c:0", page: 1 },
    { id: "d:1", page: 2 },
  ];
  const groups = [
    [{ id: "a:0" }, { id: "b:2" }],
    [{ id: "d:1" }, { id: "missing:0" }],
  ];

  const plan = buildUniquePixelJobPlan(jobs, groups, (job) => job.id);

  assert.deepEqual(plan.jobs, [jobs[0], jobs[2], jobs[3]]);
  assert.deepEqual(plan.resultIndexes, [0, 0, 1, 2]);
  let extractionCalls = 0;
  const extracted = plan.jobs.map((job) => {
    extractionCalls += 1;
    return [{ data: { extractedFrom: job.id } }];
  });
  assert.equal(extractionCalls, 3);
  const expanded = expandUniquePixelJobResults(jobs, plan, extracted);
  assert.deepEqual(expanded.map(([candidate]) => candidate.data.extractedFrom), ["a:0", "a:0", "c:0", "d:1"]);
  assert.notStrictEqual(expanded[0], expanded[1]);
  assert.notStrictEqual(expanded[0][0], expanded[1][0]);
  assert.notStrictEqual(expanded[0][0].data, expanded[1][0].data);
  assert.deepEqual(expanded, [
    [{ data: { extractedFrom: "a:0" } }],
    [{ data: { extractedFrom: "a:0" } }],
    [{ data: { extractedFrom: "c:0" } }],
    [{ data: { extractedFrom: "d:1" } }],
  ]);
});

test("keeps every job unique when there are no exact-pixel groups", () => {
  const jobs = [{ id: "a" }, { id: "b" }];

  const plan = buildUniquePixelJobPlan(jobs, [], (job) => job.id);

  assert.deepEqual(plan.jobs, jobs);
  assert.deepEqual(plan.resultIndexes, [0, 1]);
});
