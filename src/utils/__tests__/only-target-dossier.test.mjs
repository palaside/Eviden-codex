import assert from "node:assert/strict";
import test from "node:test";
import { selectTargetDossierRecords } from "../only-target-dossier.mjs";

function record(id, sender, receiver, overrides = {}) {
  return {
    id,
    source: `${id}.png`,
    chatPage: "-",
    dossierPage: 4,
    isConfirmed: false,
    isDuplicate: false,
    data: {
      sender: { name: sender, account_no: "1111", bank: "Bank A" },
      receiver: { name: receiver, account_no: "2222", bank: "Bank B" },
      bank: { name: "Bank A" },
      transaction: { amount: 100, date: "02/01/2025", time: "12:00", reference_no: id },
    },
    ...overrides,
  };
}

test("selects target transfers by exact normalized sender or receiver identity", () => {
  const records = [
    record("incoming", "คนอื่น ตัวอย่าง", "น.ส. สมใจ ใจดี"),
    record("outgoing", "สมใจ ใจดี", "คนอื่น ตัวอย่าง"),
    record("near-match", "คนอื่น ตัวอย่าง", "สมใจ ใจดี เพิ่มเติม"),
  ];

  const selected = selectTargetDossierRecords(records, "สมใจ ใจดี");

  assert.deepEqual(selected.map(({ id, direction }) => [id, direction]), [
    ["incoming", "IN"],
    ["outgoing", "OUT"],
  ]);
});

test("sorts parseable transfer dates chronologically and preserves review flags", () => {
  const late = record("late", "คนอื่น ตัวอย่าง", "สมใจ ใจดี", { isConfirmed: true });
  late.data.transaction.date = "03/01/2025";
  const early = record("early", "สมใจ ใจดี", "คนอื่น ตัวอย่าง", { isDuplicate: true });
  early.data.transaction.date = "02/01/2025";

  const selected = selectTargetDossierRecords([late, early], "สมใจ ใจดี");

  assert.deepEqual(selected.map(({ id }) => id), ["early", "late"]);
  assert.equal(selected[0].isDuplicate, true);
  assert.equal(selected[1].isConfirmed, true);
});

test("keeps unparseable dates in stable input order after dated records", () => {
  const unknownA = record("unknown-a", "สมใจ ใจดี", "คนอื่น ตัวอย่าง");
  unknownA.data.transaction.date = "ไม่ทราบ";
  const dated = record("dated", "สมใจ ใจดี", "คนอื่น ตัวอย่าง");
  const unknownB = record("unknown-b", "คนอื่น ตัวอย่าง", "สมใจ ใจดี");
  unknownB.data.transaction.date = "อ่านไม่ออก";

  assert.deepEqual(selectTargetDossierRecords([unknownA, dated, unknownB], "สมใจ ใจดี").map(({ id }) => id), [
    "dated",
    "unknown-a",
    "unknown-b",
  ]);
});
