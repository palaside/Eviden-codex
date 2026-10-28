import test from "node:test";
import assert from "node:assert/strict";
import { buildFinancialSummaryWorkbook, financialSummaryHeaders } from "../financial-summary-xlsx.mjs";

test("exports the app's 13-column ledger with source fields and numeric THB amount", async () => {
  const buffer = await buildFinancialSummaryWorkbook([{
    chatPage: "-",
    dossierPage: 4,
    source: "slip.png",
    bounds: { x: 12, y: 34, width: 500, height: 900 },
    data: {
      transaction: { date: "2025-06-09", time: "14:45", reference_no: "REF-1", amount: 5000 },
      bank: { name: "KTB" },
      sender: { name: "ผู้โอน", account_no: "XXX-1234", bank: "KTB" },
      receiver: { name: "ผู้รับ", account_no: "XXX-5678", bank: "SCB" },
    },
    isConfirmed: false,
    isDuplicate: false,
  }], { caseNumber: "คดีทดสอบ", totalNet: 5000 });

  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("รายการการเงิน");

  assert.equal(financialSummaryHeaders.length, 13);
  assert.deepEqual(sheet.getRow(1).values.slice(1), financialSummaryHeaders);
  assert.equal(sheet.getRow(2).getCell(4).value, "slip.png · 12,34");
  assert.equal(sheet.getRow(2).getCell(12).value, 5000);
  assert.equal(sheet.getRow(2).getCell(8).value, "ผู้โอน");
  assert.equal(sheet.getRow(2).getCell(10).value, "ผู้รับ");
  assert.equal(sheet.getRow(3).getCell(12).value, 5000);
  assert.match(sheet.getRow(3).getCell(1).value, /Forensic NET Loss/);
  assert.equal(sheet.pageSetup.orientation, "landscape");
  assert.equal(sheet.pageSetup.paperSize, 9);
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.equal(sheet.pageSetup.fitToHeight, 0);
  assert.equal(sheet.getRow(1).getCell(1).font.name, "Sarabun");
  assert.equal(sheet.getRow(1).getCell(1).fill.fgColor.argb, "FF1F4E78");
  assert.equal(sheet.getRow(1).getCell(1).alignment.horizontal, "center");
  assert.equal(sheet.getRow(1).getCell(1).border.top.style, "thin");
  assert.equal(sheet.getRow(2).getCell(8).border.left.style, "thin");
});

test("retains all 13 ledger columns and 41 records after workbook serialization", async () => {
  const records = Array.from({ length: 41 }, (_, index) => ({
    chatPage: index + 1,
    dossierPage: index + 2,
    source: `slip-${index + 1}.png`,
    bounds: { x: index, y: index * 2, width: 200, height: 400 },
    data: {
      transaction: { date: "2025-06-09", time: "14:45", reference_no: `REF-${index + 1}`, amount: index + 1 },
      bank: { name: "KTB" },
      sender: { name: `ผู้โอน ${index + 1}`, account_no: "XXX-1234", bank: "KTB" },
      receiver: { name: `ผู้รับ ${index + 1}`, account_no: "XXX-5678", bank: "SCB" },
    },
    isConfirmed: index % 2 === 0,
    isDuplicate: false,
  }));
  const buffer = await buildFinancialSummaryWorkbook(records, { caseNumber: "case-41", totalNet: 861 });
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("รายการการเงิน");

  assert.equal(sheet.rowCount, 43);
  assert.equal(sheet.columnCount, 13);
  assert.deepEqual(sheet.getRow(42).values.slice(1), [
    41, 41, "42 (แฟ้ม PDF)", "slip-41.png · 40,80", "2025-06-09 14:45", "KTB → SCB",
    "REF-41", "ผู้โอน 41", "XXX-1234", "ผู้รับ 41", "XXX-5678", 41, "ผู้ใช้ยืนยัน",
  ]);
  assert.equal(sheet.getRow(43).getCell(12).value, 861);
  assert.equal(sheet.pageSetup.printArea, "A1:M43");
  assert.equal(sheet.pageSetup.printTitlesRow, "1:1");
});

