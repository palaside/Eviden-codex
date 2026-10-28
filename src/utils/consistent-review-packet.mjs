const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/iu;

function requireImageData(value, label) {
  if (typeof value !== "string" || !IMAGE_DATA_URL_PATTERN.test(value)) {
    throw new Error(`${label} ไม่มีภาพ base64 ที่ใช้ได้`);
  }
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} ไม่มี SHA-256 ต้นทางที่ใช้ได้`);
  }
  return value.toLowerCase();
}

/** @param {{ dossierPage?: number | null; data?: { transaction?: { date?: string | null; time?: string | null; amount?: number | null; note?: string | null; reference_no?: string | null }; sender?: { bank?: string | null; name?: string | null }; receiver?: { bank?: string | null; name?: string | null }; bank?: { name?: string | null } } }} record */
function getSummaryRow(record) {
  const transaction = record.data?.transaction || {};
  const sender = record.data?.sender || {};
  const receiver = record.data?.receiver || {};
  const dateTime = [transaction.date, transaction.time].filter((value) => typeof value === "string" && value).join(" ");
  return [
    Number.isInteger(record.dossierPage) && record.dossierPage > 0 ? record.dossierPage : "ยังไม่ map",
    dateTime || "ต้องตรวจ",
    sender.bank || record.data?.bank?.name || "ต้องตรวจ",
    sender.name || "ต้องตรวจ",
    Number.isFinite(transaction.amount) ? transaction.amount : null,
    receiver.name || "ต้องตรวจ",
    receiver.bank || "ต้องตรวจ",
    transaction.note || "",
    transaction.reference_no || "",
    "รอตรวจทาน",
  ];
}

/**
 * @param {{
 *   caseNumber?: string;
 *   candidates?: Array<{ slipId: string; chatSourceItemId?: string; chatPageNumber: number | null; groupId: string; matchBasis: string; evidenceText?: string; timeProximityMinutes?: number | null; needsReview: boolean }>;
 *   records?: Array<{ id: string; sourceItemId: string; source: string; sha256: string; dossierPage: number | null; crop: string; imageData?: string; data: { transaction?: { date?: string | null; time?: string | null; amount?: number | null; note?: string | null; reference_no?: string | null }; sender?: { bank?: string | null; name?: string | null }; receiver?: { bank?: string | null; name?: string | null }; bank?: { name?: string | null } } }>;
 *   chatPages?: Array<{ sourceItemId: string; fileName: string; sha256: string; pageNumber: number; imageData: string }>;
 * }} input
 */
export function buildConsistentReviewPacketPayload({ caseNumber, candidates = [], records = [], chatPages = [] } = {}) {
  if (typeof caseNumber !== "string" || caseNumber.trim().length === 0 || caseNumber.length > 256) {
    throw new Error("เลขอ้างอิงเรื่องไม่ถูกต้อง");
  }
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 1000) {
    throw new Error("จำนวน candidate ต้องอยู่ระหว่าง 1 ถึง 1,000 คู่");
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  const pagesBySource = new Map(chatPages.map((page) => [`${page.sourceItemId}:${page.pageNumber}`, page]));
  const pairs = candidates.map((candidate, index) => {
    if (candidate?.needsReview !== true) throw new Error("candidate ต้องเป็นรายการรอตรวจทาน");
    const record = recordsById.get(candidate.slipId);
    if (!record) throw new Error(`ไม่พบข้อมูลสลิปของ candidate ลำดับ ${index + 1}`);
    if (!candidate.chatSourceItemId || !Number.isInteger(candidate.chatPageNumber) || candidate.chatPageNumber < 1) {
      throw new Error(`candidate ลำดับ ${index + 1} ไม่มี source/page อ้างอิงที่ครบ`);
    }
    const page = pagesBySource.get(`${candidate.chatSourceItemId}:${candidate.chatPageNumber}`);
    if (!page) throw new Error(`ไม่พบภาพหน้าแชทต้นทางของ candidate ลำดับ ${index + 1}`);

    return {
      pairNumber: index + 1,
      reviewStatus: "PENDING_HUMAN_REVIEW",
      matchBasis: candidate.matchBasis,
      evidenceText: typeof candidate.evidenceText === "string" ? candidate.evidenceText.slice(0, 2000) : "",
      timeProximityMinutes: Number.isFinite(candidate.timeProximityMinutes) ? candidate.timeProximityMinutes : null,
      chat: {
        sourceItemId: page.sourceItemId,
        fileName: page.fileName,
        pageNumber: page.pageNumber,
        sha256: requireSha256(page.sha256, "หน้าแชท"),
        imageData: requireImageData(page.imageData, "หน้าแชท"),
      },
      slip: {
        sourceItemId: record.sourceItemId,
        fileName: record.source,
        dossierPage: Number.isInteger(record.dossierPage) ? record.dossierPage : null,
        sha256: requireSha256(record.sha256, "สลิป"),
        imageData: requireImageData(record.imageData ?? record.crop, "สลิป"),
      },
    };
  });

  return {
    schemaVersion: 1,
    caseNumber: caseNumber.trim(),
    generatedAt: new Date().toISOString(),
    pairs,
    summaryRows: pairs.map((pair) => getSummaryRow(recordsById.get(candidates[pair.pairNumber - 1].slipId))),
  };
}
