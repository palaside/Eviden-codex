import assert from "node:assert/strict";
import test from "node:test";
import { buildNamedCaseOutputPlans, groupImageBatchByPrefix, prepareImageBatch } from "../prepare-image-batch.mjs";

test("sorts filenames in natural order without mutating intake order", () => {
  const input = [
    { id: "ten", fileName: "chatv3 (10).png", sha256: "10" },
    { id: "two", fileName: "chatv3 (2).png", sha256: "2" },
    { id: "one", fileName: "chatv3 (1).png", sha256: "1" },
  ];

  const result = prepareImageBatch(input);

  assert.deepEqual(result.map((item) => item.id), ["one", "two", "ten"]);
  assert.deepEqual(input.map((item) => item.id), ["ten", "two", "one"]);
});

test("keeps duplicate occurrences and points each exact copy to its first sorted master", () => {
  const result = prepareImageBatch([
    { id: "copy", fileName: "case (2).png", sha256: "ABC" },
    { id: "master", fileName: "case (1).png", sha256: "abc" },
    { id: "no-hash", fileName: "case (3).png", sha256: "" },
  ]);

  assert.deepEqual(result.map(({ id, isDuplicate, duplicateOfId }) => ({ id, isDuplicate, duplicateOfId })), [
    { id: "master", isDuplicate: false, duplicateOfId: null },
    { id: "copy", isDuplicate: true, duplicateOfId: "master" },
    { id: "no-hash", isDuplicate: false, duplicateOfId: null },
  ]);
});

test("groups Windows-renamed case prefixes without merging different cases", () => {
  const groups = groupImageBatchByPrefix([
    { id: "v1a", fileName: "V1- (1).jpg" },
    { id: "v2a", fileName: "V2- (1).jpg" },
    { id: "v1b", fileName: "V1- (2) - Copy.jpg" },
    { id: "case1", fileName: "Case_Somchai (3).png" },
    { id: "case2", fileName: "Case_Somchai (4).png" },
  ]);

  assert.deepEqual(groups.map(({ prefix, files }) => ({ prefix, ids: files.map((file) => file.id) })), [
    { prefix: "V1", ids: ["v1a", "v1b"] },
    { prefix: "V2", ids: ["v2a"] },
    { prefix: "Case_Somchai", ids: ["case1", "case2"] },
  ]);
});

test("keeps files without a Windows numeric rename suffix ungrouped", () => {
  const groups = groupImageBatchByPrefix([
    { id: "first", fileName: "screenshot final.png" },
    { id: "second", fileName: "evidence.pdf.png" },
  ]);

  assert.deepEqual(groups.map(({ prefix, files }) => ({ prefix, ids: files.map((file) => file.id) })), [
    { prefix: null, ids: ["first"] },
    { prefix: null, ids: ["second"] },
  ]);
});

test("builds safe named output plans per case prefix and naturally orders source ids", () => {
  const plans = buildNamedCaseOutputPlans([
    { id: "v1-ten", fileName: "V1- (10).png" },
    { id: "other", fileName: "single evidence.png" },
    { id: "v1-two", fileName: "V1- (2).png" },
    { id: "unsafe", fileName: "Case:North? (1).png" },
  ]);

  assert.deepEqual(plans.map(({ label, outputStem, itemIds }) => ({ label, outputStem, itemIds })), [
    { label: "V1", outputStem: "V1", itemIds: ["v1-two", "v1-ten"] },
    { label: "single evidence", outputStem: "single evidence", itemIds: ["other"] },
    { label: "Case:North?", outputStem: "Case_North_", itemIds: ["unsafe"] },
  ]);
});

test("disambiguates names that collapse to the same safe output stem", () => {
  const plans = buildNamedCaseOutputPlans([
    { id: "a", fileName: "Case:A (1).png" },
    { id: "b", fileName: "Case?A (1).png" },
  ]);

  assert.deepEqual(plans.map((plan) => plan.outputStem), ["Case_A", "Case_A_2"]);
});
