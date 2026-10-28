export const financialSummaryIndexHeaders = [
  "หน้าระบุสลิป",
  "วันที่ - เวลา",
  "ธนาคารผู้โอน",
  "ชื่อผู้โอน",
  "จำนวนเงิน (บาท)",
  "ชื่อผู้รับโอน",
  "ธนาคารผู้รับ",
  "บันทึก",
  "รหัสอ้างอิง",
  "สถานะหลักฐาน",
];

export function financialSummaryIndexPageBreakAfterRecordCounts(recordCount) {
  if (!Number.isInteger(recordCount) || recordCount < 0) return [];
  const rows = [];
  for (let completed = 20; completed < recordCount; completed += 20) rows.push(completed);
  return rows;
}

export function buildFinancialSummaryIndexRows(records, physicalPages = {}) {
  return records.map((record) => {
    const data = record.data || {};
    const transaction = data.transaction || {};
    const sender = data.sender || {};
    const receiver = data.receiver || {};
    const dateTime = [transaction.date, transaction.time].filter(Boolean).join(" ");
    return [
      Number.isInteger(physicalPages[record.id]) ? physicalPages[record.id] : "ยังไม่ map",
      dateTime || "ต้องตรวจ",
      sender.bank || data.bank?.name || "ต้องตรวจ",
      sender.name || "ต้องตรวจ",
      Number.isFinite(transaction.amount) ? transaction.amount : null,
      receiver.name || "ต้องตรวจ",
      receiver.bank || "ต้องตรวจ",
      transaction.note || "",
      transaction.reference_no || "",
      record.isConfirmed ? "ผู้ใช้ยืนยัน" : "รอตรวจทาน",
    ];
  });
}

export async function createFinancialSummaryIndexWorkbook(records, {
  caseNumber = "",
  physicalPages = {},
} = {}) {
  const loaded = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = loaded.default ?? loaded;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Digital Evidence";
  workbook.subject = "Standalone financial summary and slip index";
  const sheet = workbook.addWorksheet("สารบัญการเงิน", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.49, right: 0.49, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
  });
  sheet.columns = [16, 20, 18, 28, 17, 30, 18, 20, 22, 18].map((width) => ({ width }));
  sheet.addRow(["สารบัญสรุปรายการทางการเงิน"]);
  sheet.mergeCells("A1:J1");
  sheet.addRow([`เลขอ้างอิงเรื่อง: ${caseNumber || "ไม่ระบุ"} · จำนวนรายการ: ${records.length} · อ้างอิงหน้าเล่มเนื้อหาแยก`]);
  sheet.mergeCells("A2:J2");
  sheet.addRow(financialSummaryIndexHeaders);
  const pageBreaks = new Set(financialSummaryIndexPageBreakAfterRecordCounts(records.length));
  for (const [index, values] of buildFinancialSummaryIndexRows(records, physicalPages).entries()) {
    const row = sheet.addRow(values);
    row.height = 32;
    row.eachCell((cell) => {
      cell.font = { name: "Sarabun", size: 10, color: { argb: "FF111827" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    row.getCell(5).numFmt = '#,##0.00;[Red]-#,##0.00';
    if (pageBreaks.has(index + 1)) row.addPageBreak();
  }
  for (const rowNumber of [1, 2, 3]) {
    const row = sheet.getRow(rowNumber);
    row.height = rowNumber === 1 ? 30 : rowNumber === 2 ? 24 : 38;
    row.eachCell((cell) => {
      cell.font = { name: "Sarabun", size: rowNumber === 1 ? 15 : 10, bold: rowNumber !== 2, color: { argb: rowNumber === 3 ? "FFFFFFFF" : "FF0F172A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber === 3 ? "FF1B365D" : "FFEAF2F8" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
  }
  sheet.autoFilter = { from: "A3", to: `J${Math.max(3, sheet.rowCount)}` };
  sheet.pageSetup.printTitlesRow = "1:3";
  sheet.pageSetup.printArea = `A1:J${Math.max(3, sheet.rowCount)}`;
  return workbook;
}

export async function buildFinancialSummaryIndexWorkbook(records, options) {
  const workbook = await createFinancialSummaryIndexWorkbook(records, options);
  return workbook.xlsx.writeBuffer({ useStyles: true });
}

export async function downloadFinancialSummaryIndexXlsx(records, fileName, options) {
  const buffer = await buildFinancialSummaryIndexWorkbook(records, options);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
