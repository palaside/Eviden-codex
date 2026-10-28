const headers = ["ลำดับ", "วันที่", "เวลา", "ทิศทาง", "ชื่อผู้โอน", "บัญชีผู้โอน", "ชื่อคู่รายการ", "บัญชีคู่รายการ", "สถานะ", "จำนวนเงิน (บาท)", "ไฟล์/หน้า", "เลขอ้างอิง"];

export async function buildTargetLedgerWorkbook(records, { targetName, caseNumber = "" } = {}) {
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Digital Evidence";
  workbook.subject = "Individual target financial ledger";

  const confirmed = records.filter((item) => item.isConfirmed && !item.isDuplicate);
  const incoming = confirmed.filter((item) => item.direction === "IN").reduce((sum, item) => sum + (Number(item.data?.transaction?.amount) || 0), 0);
  const outgoing = confirmed.filter((item) => item.direction === "OUT").reduce((sum, item) => sum + (Number(item.data?.transaction?.amount) || 0), 0);
  const summary = workbook.addWorksheet("สรุปเป้าหมาย");
  summary.columns = [{ width: 34 }, { width: 34 }];
  summary.addRows([
    ["บัญชีรายการบุคคลเป้าหมาย", caseNumber],
    ["ชื่อเป้าหมาย (ตรงชื่อเต็มหลังตัดคำนำหน้า)", targetName],
    ["รายการที่พบ", records.length],
    ["ยอดเงินเข้าที่ตรวจยืนยันแล้ว (ไม่รวมรายการซ้ำ)", incoming],
    ["ยอดเงินออกที่ตรวจยืนยันแล้ว (ไม่รวมรายการซ้ำ)", outgoing],
    ["ผลต่างเข้า - ออก (รายการยืนยันเท่านั้น)", incoming - outgoing],
    ["หมายเหตุ", "รายการรอตรวจ/ซ้ำคงอยู่ในชีตรายการ แต่ไม่รวมยอดสรุป"],
  ]);
  [4, 5, 6].forEach((row) => { summary.getCell(`B${row}`).numFmt = '#,##0.00;[Red]-#,##0.00'; });
  summary.getColumn(1).font = { bold: true };

  const ledger = workbook.addWorksheet("รายการเป้าหมาย", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ledger.columns = [8, 16, 12, 14, 28, 20, 28, 20, 22, 18, 36, 24].map((width) => ({ width }));
  ledger.addRow(headers);
  const head = ledger.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  head.alignment = { wrapText: true, vertical: "middle" };
  for (const [index, item] of records.entries()) {
    const data = item.data || {};
    const sender = data.sender || {};
    const receiver = data.receiver || {};
    const status = [item.isDuplicate ? "รายการซ้ำ" : "", item.isConfirmed ? "ยืนยันแล้ว" : "รอตรวจ"].filter(Boolean).join(" · ");
    const row = ledger.addRow([
      index + 1, data.transaction?.date || "ไม่ทราบ", data.transaction?.time || "ไม่ทราบ", item.direction,
      sender.name || "ไม่พบ", sender.account_no || "ไม่พบ", receiver.name || "ไม่พบ", receiver.account_no || "ไม่พบ",
      status, Number.isFinite(data.transaction?.amount) ? data.transaction.amount : null,
      `${item.source || ""}${item.chatPage && item.chatPage !== "-" ? ` · แชท ${item.chatPage}` : ""}${item.dossierPage ? ` · หน้า ${item.dossierPage}` : ""}`,
      data.transaction?.reference_no || "",
    ]);
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell(10).numFmt = '#,##0.00;[Red]-#,##0.00';
  }
  ledger.autoFilter = { from: "A1", to: `L${Math.max(1, ledger.rowCount)}` };
  ledger.pageSetup.printTitlesRow = "1:1";
  return workbook.xlsx.writeBuffer({ useStyles: true });
}

export async function downloadTargetLedgerXlsx(records, fileName, options) {
  const buffer = await buildTargetLedgerWorkbook(records, options);
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
