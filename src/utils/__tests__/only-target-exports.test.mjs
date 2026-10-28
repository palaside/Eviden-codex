import assert from "node:assert/strict";
import test from "node:test";
import { buildTargetLedgerWorkbook } from "../only-target-exports.mjs";

test("builds a target-only ledger with directional totals based only on confirmed non-duplicates", async () => {
  const records = [
    { id: "in", direction: "IN", source: "in.png", chatPage: "-", dossierPage: 4, isConfirmed: true, isDuplicate: false, data: { transaction: { date: "01/02/2025", time: "10:00", amount: 100 }, sender: { name: "A", account_no: "1", bank: "X" }, receiver: { name: "Target", account_no: "2", bank: "Y" } } },
    { id: "out", direction: "OUT", source: "out.png", chatPage: "-", dossierPage: 5, isConfirmed: true, isDuplicate: false, data: { transaction: { date: "02/02/2025", time: "11:00", amount: 30 }, sender: { name: "Target", account_no: "2", bank: "Y" }, receiver: { name: "A", account_no: "1", bank: "X" } } },
    { id: "pending", direction: "IN", source: "pending.png", chatPage: "-", dossierPage: 6, isConfirmed: false, isDuplicate: false, data: { transaction: { date: "03/02/2025", time: "12:00", amount: 500 }, sender: { name: "A" }, receiver: { name: "Target" } } },
    { id: "duplicate", direction: "IN", source: "duplicate.png", chatPage: "-", dossierPage: 7, isConfirmed: true, isDuplicate: true, data: { transaction: { date: "04/02/2025", time: "13:00", amount: 100 }, sender: { name: "A" }, receiver: { name: "Target" } } },
  ];
  const buffer = await buildTargetLedgerWorkbook(records, { targetName: "Target", caseNumber: "C-1" });
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const summary = workbook.getWorksheet("สรุปเป้าหมาย");
  const ledger = workbook.getWorksheet("รายการเป้าหมาย");
  assert.equal(summary.getCell("B2").value, "Target");
  assert.equal(summary.getCell("B4").value, 100);
  assert.equal(summary.getCell("B5").value, 30);
  assert.equal(summary.getCell("B6").value, 70);
  assert.equal(ledger.rowCount, 5);
  assert.equal(ledger.getRow(2).getCell(1).value, 1);
  assert.equal(ledger.getRow(4).getCell(9).value, "รอตรวจ");
  assert.equal(ledger.getRow(5).getCell(9).value, "รายการซ้ำ · ยืนยันแล้ว");
});
