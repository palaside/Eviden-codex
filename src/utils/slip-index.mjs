import { buildSlipFallbackMetadata } from "./slip-fallback-metadata.mjs";

const SYNTHETIC_REFERENCE = /^(?:CHAT|SLIP)[-_]/iu;

function canonicalReference(value) {
  return typeof value === "string" && !SYNTHETIC_REFERENCE.test(value.trim())
    ? value.replace(/[\s\-_/]/gu, "").toLocaleUpperCase()
    : "";
}

function transactionSignature(record) {
  const transaction = record.data?.transaction || {};
  const ref = canonicalReference(transaction.reference_no);
  if (!ref) return null;
  return JSON.stringify([
    ref,
    transaction.amount ?? null,
    transaction.date ?? null,
    (record.data?.bank?.name || "").trim().toLocaleLowerCase(),
  ]);
}

export function makePdfPageMapKey(source, sha256, chatPage) {
  return JSON.stringify([source || "", sha256 || "", chatPage || "-"]);
}

export function filterSlipRecordsBySourceItemIds(records, sourceItemIds) {
  const selectedIds = new Set(sourceItemIds);
  return records.filter((record) => selectedIds.has(record.sourceItemId));
}

export function prepareNamedGroupSlipIndex(records, plan, caseNumber) {
  const groupRecords = filterSlipRecordsBySourceItemIds(records, plan.itemIds);
  const index = buildSlipIndex(groupRecords, `${caseNumber} · ${plan.label}`);
  return {
    fileName: `Evidence_Chat_${plan.outputStem}_Slip_Index.json`,
    json: JSON.stringify(index, null, 2),
    transactionCount: index.transaction_count,
  };
}

function safeFilePart(value, fallback) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9\u0E00-\u0E7F_-]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 80) || fallback;
}

export function prepareSlipRecordArtifact(record, caseNumber, pdfPageMap = {}, generatedAt) {
  const index = buildSlipIndex([record], caseNumber, generatedAt, pdfPageMap);
  const sourceStem = record.source.replace(/^.*[\\/]/u, "").replace(/\.[^.]*$/u, "");
  const fileName = [
    "Digital_Evidence",
    safeFilePart(caseNumber, "case"),
    safeFilePart(sourceStem, "slip"),
    safeFilePart(record.id, "candidate"),
  ].join("_") + ".json";
  return { fileName, json: JSON.stringify(index, null, 2) };
}

function toOccurrence(record, pdfPageMap) {
  const fallbackMeta = buildSlipFallbackMetadata(record.data);
  return {
    candidate_id: record.id,
    source_file: record.source,
    source_sha256: record.sha256 || null,
    chat_page: record.chatPage,
    dossier_page: record.dossierPage,
    pdf_page_number: Number.isInteger(pdfPageMap[makePdfPageMapKey(record.source, record.sha256, record.chatPage)])
      ? pdfPageMap[makePdfPageMapKey(record.source, record.sha256, record.chatPage)]
      : null,
    source_bounds: record.bounds || null,
    is_confirmed: Boolean(record.isConfirmed),
    needs_review: Boolean(record.needsReview || fallbackMeta.needs_human_review),
    _fallback_meta: fallbackMeta,
  };
}

function toSlipRecord(record, pdfPageMap) {
  const fallbackMeta = buildSlipFallbackMetadata(record.data);
  return {
    candidate_id: record.id,
    source_file: record.source,
    source_sha256: record.sha256 || null,
    chat_page: record.chatPage,
    dossier_page: record.dossierPage,
    pdf_page_number: Number.isInteger(pdfPageMap[makePdfPageMapKey(record.source, record.sha256, record.chatPage)])
      ? pdfPageMap[makePdfPageMapKey(record.source, record.sha256, record.chatPage)]
      : null,
    source_bounds: record.bounds || null,
    is_confirmed: Boolean(record.isConfirmed),
    needs_review: Boolean(record.needsReview || fallbackMeta.needs_human_review),
    bank: record.data.bank,
    transaction: record.data.transaction,
    sender: record.data.sender,
    receiver: record.data.receiver,
    confidence: record.data.confidence,
    raw_text: record.data.raw_text,
    warnings: record.data.warnings,
    _fallback_meta: fallbackMeta,
  };
}

export function buildSlipIndex(records, caseNumber, generatedAt = new Date().toISOString(), pdfPageMap = {}) {
  const slipRecords = records.map((record) => toSlipRecord(record, pdfPageMap));
  const groups = new Map();
  const singles = [];

  for (const record of records) {
    const signature = transactionSignature(record);
    const occurrence = toOccurrence(record, pdfPageMap);
    if (!signature) {
      singles.push({ record, occurrences: [occurrence] });
      continue;
    }

    const group = groups.get(signature);
    if (group) group.occurrences.push(occurrence);
    else groups.set(signature, { record, occurrences: [occurrence] });
  }

  const transactions = [...groups.values(), ...singles]
    .map(({ record, occurrences }) => {
      const data = record.data;
      const transaction = data.transaction;
      const pageNumbers = occurrences.map((item) => item.dossier_page).filter(Number.isFinite);
      const pdfPages = occurrences.map((item) => item.pdf_page_number).filter(Number.isInteger);
      return {
        reference_no: transaction.reference_no || null,
        date: transaction.date || null,
        time: transaction.time || null,
        bank: data.bank?.name || null,
        amount: transaction.amount ?? null,
        currency: transaction.currency || "THB",
        sender: data.sender || null,
        receiver: data.receiver || null,
        confidence: data.confidence || null,
        needs_review: occurrences.some((item) => item.needs_review),
        occurrence_count: occurrences.length,
        dossier_pages: [...new Set(pageNumbers)].sort((a, b) => a - b),
        pdf_pages: [...new Set(pdfPages)].sort((a, b) => a - b),
        occurrences,
      };
    })
    .sort((a, b) => (a.dossier_pages[0] ?? Number.MAX_SAFE_INTEGER) - (b.dossier_pages[0] ?? Number.MAX_SAFE_INTEGER));

  return {
    schema_version: "1.2",
    index_type: "app_detected_slip_candidates",
    source: "Slip fields come from app OCR candidates; PDF page numbers come from exact embedded evidence-page markers when available. This is not a raster rescan or OCR of the exported PDF",
    case_number: caseNumber,
    generated_at: generatedAt,
    candidate_count: records.length,
    transaction_count: transactions.length,
    slip_records: slipRecords,
    transactions,
  };
}

function cell(value) {
  return String(value ?? "-").replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " ").trim() || "-";
}

function evidencePageCell(transaction) {
  const pdfPages = transaction.pdf_pages;
  const dossierPages = transaction.dossier_pages;
  if (pdfPages.length) {
    const physical = `PDF ${pdfPages.join(", ")}`;
    return dossierPages.length ? `${physical} · A4 ${dossierPages.join(", ")}` : physical;
  }
  return dossierPages.length ? `A4 ${dossierPages.join(", ")} · PDF ยังไม่ทำดัชนี` : "PDF ยังไม่ทำดัชนี";
}

function chatPageCell(transaction) {
  const pages = transaction.occurrences.map((item) => item.chat_page).filter((value) => value !== null && value !== undefined && value !== "-");
  return [...new Set(pages)].join(", ") || "-";
}

function partyCell(party, key) {
  const values = transactionPartyValues(party, key);
  return [...new Set(values)].join(", ") || "-";
}

function transactionPartyValues(party, key) {
  return party ? [party[key]].filter((value) => typeof value === "string" && value.trim()) : [];
}

export function buildSlipIndexMarkdown(index) {
  const headers = ["ลำดับ", "หน้าแชท", "หน้า PDF / A4", "ภาพ/พิกัดอ้างอิง", "วันที่-เวลา", "ธนาคาร", "Ref ID", "ชื่อผู้โอน", "บัญชีต้นทาง", "ชื่อผู้รับ", "บัญชีปลายทาง", "จำนวนเงิน (บาท)", "สถานะการตรวจพิสูจน์"];
  const lines = [
    `# สารบัญสลิป: ${cell(index.case_number)}`,
    "",
    `สร้างเมื่อ: ${cell(index.generated_at)} · ${index.transaction_count} รายการธุรกรรม จาก ${index.candidate_count} OCR candidates`,
    `แหล่งข้อมูล: ${cell(index.source)}`,
    "",
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];

  index.transactions.forEach((transaction, position) => {
    const occurrenceRefs = transaction.occurrences.map((item) => {
      const bounds = item.source_bounds;
      return bounds
        ? `${item.source_file} (${bounds.x},${bounds.y},${bounds.width},${bounds.height})`
        : item.source_file;
    });
    const status = transaction.occurrences.every((item) => item.is_confirmed)
      ? "ยืนยันแล้ว"
      : transaction.needs_review ? "รอตรวจทาน" : "ยังไม่ยืนยัน";
    const row = [
      position + 1,
      chatPageCell(transaction),
      evidencePageCell(transaction),
      [...new Set(occurrenceRefs)].join("; "),
      [transaction.date, transaction.time].filter(Boolean).join(" "),
      transaction.bank,
      transaction.reference_no,
      partyCell(transaction.sender, "name"),
      partyCell(transaction.sender, "account_no"),
      partyCell(transaction.receiver, "name"),
      partyCell(transaction.receiver, "account_no"),
      transaction.amount == null ? null : Number(transaction.amount).toFixed(2),
      status,
    ].map(cell);
    lines.push(`| ${row.join(" | ")} |`);
  });

  return `${lines.join("\n")}\n`;
}
