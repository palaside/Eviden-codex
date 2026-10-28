import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { buildFinancialSummaryIndexRows, createFinancialSummaryIndexWorkbook, financialSummaryIndexHeaders, financialSummaryIndexPageBreakAfterRecordCounts } from "../financial-summary-index.mjs";

test("maps records to the separate 10-column index and uses only supplied physical page references", () => {
  const rows = buildFinancialSummaryIndexRows([{
    id: "slip-1",
    isConfirmed: false,
    data: {
      transaction: { date: "2025-06-09", time: "14:45", amount: 5000, reference_no: "REF-1", note: "ค่ามัดจำ" },
      bank: { name: "ธนาคารไทย" },
      sender: { name: "ผู้โอน", bank: "ธนาคารต้นทาง" },
      receiver: { name: "ผู้รับ", bank: "ธนาคารปลายทาง" },
    },
  }], { "slip-1": 7 });

  assert.equal(financialSummaryIndexHeaders.length, 10);
  assert.deepEqual(rows[0], [
    7, "2025-06-09 14:45", "ธนาคารต้นทาง", "ผู้โอน", 5000,
    "ผู้รับ", "ธนาคารปลายทาง", "ค่ามัดจำ", "REF-1", "รอตรวจทาน",
  ]);
});

test("does not invent a physical page or missing slip fields", () => {
  const rows = buildFinancialSummaryIndexRows([{
    id: "slip-unmapped",
    isConfirmed: true,
    data: {
      transaction: { date: null, time: null, amount: null, reference_no: null, note: null },
      bank: { name: null },
      sender: { name: null, bank: null },
      receiver: { name: null, bank: null },
    },
  }]);

  assert.deepEqual(rows[0], [
    "ยังไม่ map", "ต้องตรวจ", "ต้องตรวจ", "ต้องตรวจ", null,
    "ต้องตรวจ", "ต้องตรวจ", "", "", "ผู้ใช้ยืนยัน",
  ]);
});

test("serializes a separate landscape 10-column workbook with repeated headers and 20-record breaks", async () => {
  const records = Array.from({ length: 41 }, (_, index) => ({
    id: `slip-${index + 1}`,
    isConfirmed: index === 0,
    data: {
      transaction: { date: "2025-06-09", time: "14:45", amount: 100 + index, reference_no: `REF-${index + 1}`, note: null },
      bank: { name: "Bank" },
      sender: { name: "Sender", bank: "Bank A" },
      receiver: { name: "Receiver", bank: "Bank B" },
    },
  }));
  const generatedWorkbook = await createFinancialSummaryIndexWorkbook(records, {
    caseNumber: "case-1",
    physicalPages: Object.fromEntries(records.map((record, index) => [record.id, index + 1])),
  });
  const worksheetModel = generatedWorkbook.getWorksheet("สารบัญการเงิน");
  const buffer = await generatedWorkbook.xlsx.writeBuffer({ useStyles: true });
  const archive = await JSZip.loadAsync(buffer);
  const worksheetXml = await archive.file("xl/worksheets/sheet1.xml").async("string");
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("สารบัญการเงิน");

  assert.deepEqual(sheet.getRow(3).values.slice(1), financialSummaryIndexHeaders);
  assert.equal(financialSummaryIndexHeaders.length, 10);
  assert.equal(sheet.getRow(4).getCell(1).value, 1);
  assert.equal(sheet.getRow(4).getCell(5).value, 100);
  assert.equal(sheet.pageSetup.orientation, "landscape");
  assert.equal(sheet.pageSetup.paperSize, 9);
  assert.equal(sheet.pageSetup.printTitlesRow, "1:3");
  assert.equal(sheet.pageSetup.printArea, "A1:J44");
  assert.deepEqual([...worksheetXml.matchAll(/<brk id="(\d+)"/g)].map((match) => Number(match[1])), [23, 43]);
  assert.deepEqual(worksheetModel.rowBreaks.map((pageBreak) => pageBreak.id), [23, 43]);
  assert.deepEqual(financialSummaryIndexPageBreakAfterRecordCounts(records.length), [20, 40]);
});
