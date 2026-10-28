export const financialSummaryHeaders = [
  "ลำดับ",
  "หน้าแชท",
  "หน้า A4",
  "ภาพ/พิกัดอ้างอิง",
  "วันที่-เวลา",
  "ธนาคาร",
  "รหัสอ้างอิงธุรกรรม (Ref ID)",
  "ชื่อผู้โอน (ต้นทาง)",
  "เลขที่บัญชีต้นทาง",
  "ชื่อผู้รับโอน (ปลายทาง)",
  "เลขที่บัญชีปลายทาง",
  "จำนวนเงิน (บาท)",
  "สถานะการตรวจพิสูจน์",
];

function toLedgerRow(record, index) {
  const data = record.data;
  return [
    index + 1,
    record.chatPage || "-",
    record.dossierPage ? `${record.dossierPage} (แฟ้ม PDF)` : "ดูรายการหลักฐาน",
    `${record.source || ""}${record.bounds ? ` · ${record.bounds.x},${record.bounds.y}` : ""}`,
    [data.transaction.date, data.transaction.time].filter(Boolean).join(" ") || "ต้องตรวจ",
    [data.sender.bank, data.receiver.bank].filter(Boolean).join(" → ") || data.bank.name || "ต้องตรวจ",
    data.transaction.reference_no || "",
    data.sender.name || "",
    data.sender.account_no || "",
    data.receiver.name || "",
    data.receiver.account_no || "",
    Number.isFinite(data.transaction.amount) ? data.transaction.amount : null,
    record.isConfirmed ? "ผู้ใช้ยืนยัน" : "รอตรวจและยืนยัน",
  ];
}

export async function buildFinancialSummaryWorkbook(records, { caseNumber = "", totalNet = 0 } = {}) {
  const loaded = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = loaded.default ?? loaded;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Digital Evidence";
  workbook.subject = "Financial evidence index";
  const sheet = workbook.addWorksheet("รายการการเงิน", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  sheet.columns = [
    { width: 8 }, { width: 12 }, { width: 14 }, { width: 32 }, { width: 20 },
    { width: 28 }, { width: 26 }, { width: 26 }, { width: 20 }, { width: 28 },
    { width: 20 }, { width: 16 }, { width: 24 },
  ];
  sheet.addRow(financialSummaryHeaders);
  const header = sheet.getRow(1);
  header.height = 34;
  header.eachCell((cell) => {
    cell.font = { name: "Sarabun", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  for (const [index, record] of records.entries()) {
    const row = sheet.addRow(toLedgerRow(record, index));
    row.height = 30;
    row.eachCell((cell) => {
      cell.font = { name: "Sarabun", size: 10, color: { argb: "FF111827" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.getCell(12).numFmt = '#,##0.00;[Red]-#,##0.00';
  }
  const totalRow = sheet.addRow([`ยอดรวมหลังตรวจรายการซ้ำ (Forensic NET Loss)${caseNumber ? ` · ${caseNumber}` : ""}`, "", "", "", "", "", "", "", "", "", "", Number(totalNet) || 0, "ยอดตามรายการที่ยืนยันแล้ว"]);
  sheet.mergeCells(totalRow.number, 1, totalRow.number, 11);
  totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
  totalRow.getCell(1).font = { name: "Sarabun", size: 10, bold: true };
  totalRow.getCell(12).numFmt = '#,##0.00;[Red]-#,##0.00';
  totalRow.getCell(12).font = { name: "Sarabun", size: 10, bold: true };
  totalRow.height = 28;
  const lastRow = Math.max(1, sheet.rowCount);
  for (let rowIndex = 1; rowIndex <= lastRow; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
    });
  }
  sheet.autoFilter = { from: "A1", to: `M${lastRow}` };
  sheet.pageSetup.printTitlesRow = "1:1";
  sheet.pageSetup.printArea = `A1:M${lastRow}`;
  return workbook.xlsx.writeBuffer({ useStyles: true });
}

export async function downloadFinancialSummaryXlsx(records, fileName, options) {
  const buffer = await buildFinancialSummaryWorkbook(records, options);
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
