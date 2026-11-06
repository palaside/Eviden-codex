import test from "node:test";
import assert from "node:assert/strict";
import { selectRepresentativeRecords } from "../create-representative100.mjs";

test("representative selection uses immutable inventory order and only terminal records", () => {
  const inventory = ["a", "b", "c", "d"].map((name) => ({ fixturePath: name, sourceSha256: name.repeat(64).slice(0, 64) }));
  const results = [
    { fixturePath: "b", sourceSha256: inventory[1].sourceSha256, status: "review_required" },
    { fixturePath: "c", sourceSha256: inventory[2].sourceSha256, status: "not_run" },
    { fixturePath: "d", sourceSha256: inventory[3].sourceSha256, status: "failed" },
  ];
  const selected = selectRepresentativeRecords({ inventory, results, limit: 2 });
  assert.deepEqual(selected.map((record) => record.fixturePath), ["b", "d"]);
});
