import { parseChatEventTimestamp } from "./chat-capture-metadata.mjs";

const TRANSFER_INTENT = /ยืม|กู้|โอน|สลิป|เช็กยอด|เช็คยอด|คืน|จ่าย|ทวงหนี้|ดอกเบี้ย|transfer|borrow|loan|repay|payment|send\s+money/iu;
const EXPLICIT_TRANSFER_INTENT = /โอน|สลิป|จ่าย|transfer|payment|send\s+money/iu;
const LEGAL_INTENT = /ขอยืม|ขอกู้|ขอเงิน|ปล่อยกู้|ยืมเงิน|กู้เงิน|หักดอก|ดอกเบี้ย|ทวงหนี้|สัญญา/iu;
const TRANSFER_CONFIRMATION_INTENT = /ส่งให้แล้ว|เรียบร้อย(?:ค่ะ|ครับ)?/iu;
const SYNTHETIC_REFERENCE = /^(?:CHAT|SLIP)[-_]/iu;
const MAX_VISUAL_SIMILARITY_DISTANCE = 8;
const MAX_TIMESTAMP_PROXIMITY_MINUTES = 15;

/** @typedef {{ slipId: string; chatPageNumber: number | null; chatSourceItemId?: string; groupId: string; matchBasis: string; timeProximityMinutes?: number | null; timeWindowValidated?: boolean; timestampOutsideWindow?: boolean; evidenceText: string; needsReview: boolean; similarityDistance?: number }} ChatSlipCorroborationCandidate */

function normalizeReference(value) {
  return typeof value === "string" ? value.replace(/[^\p{L}\p{N}]/gu, "").toLocaleUpperCase() : "";
}

function containsCompleteReference(text, reference) {
  if (!reference) return false;
  const tokens = text.match(/[\p{L}\p{N}][\p{L}\p{N}_/-]*/gu) || [];
  if (tokens.some((token) => normalizeReference(token) === reference)) return true;

  const labeledValues = text.matchAll(/(?:\bref(?:erence)?|รหัสอ้างอิง|เลขอ้างอิง)\s*[:#-]?\s*([\p{L}\p{N}][\p{L}\p{N}_/-]*)/giu);
  for (const match of labeledValues) {
    if (normalizeReference(match[1]) === reference) return true;
  }
  return false;
}

function amountToSatang(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function amountsInText(text) {
  const values = new Set();
  const pattern = /(?:(฿)\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(บาท|THB))?/giu;
  for (const match of text.matchAll(pattern)) {
    const [, currencySymbol, rawInteger, rawFraction, currencyUnit] = match;
    if (!rawFraction && !currencySymbol && !currencyUnit) continue;
    const value = Number(`${rawInteger.replace(/,/g, "")}.${(rawFraction || "").padEnd(2, "0") || "00"}`);
    if (Number.isFinite(value) && value > 0) values.add(Math.round(value * 100));
  }

  const contextualBareAmounts = /(?:ยอด(?:เงิน)?|จำนวน(?:เงิน)?|คงเหลือ|เหลือ|เหลอ)\s*[:=]?\s*(\d{1,3}(?:,\d{3})+|\d{4,})(?![\p{L}\p{N}])/giu;
  for (const match of text.matchAll(contextualBareAmounts)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) values.add(Math.round(value * 100));
  }

  return values;
}

function isInsideExcludedRegion(token, regions) {
  return (token.sourceReferences || []).some((source) => regions.some((region) => {
    if (source.sourceItemId !== region.sourceItemId || !source.bounds || !region.bounds) return false;
    const centerX = source.bounds.x + source.bounds.width / 2;
    const centerY = source.bounds.y + source.bounds.height / 2;
    return centerX >= region.bounds.x
      && centerX <= region.bounds.x + region.bounds.width
      && centerY >= region.bounds.y
      && centerY <= region.bounds.y + region.bounds.height;
  }));
}

export function buildChatOcrGroups(layer2 = [], excludedRegions = [], layer1 = []) {
  const grouped = new Map();
  const groupsOverlappingEmbeddedSlips = new Set();
  const timestampsByGroup = new Map(layer1
    .filter((item) => item?.kind === "timestamp_marker_candidate" && item.relatedTextGroupId && item.label)
    .map((item) => [item.relatedTextGroupId, parseChatEventTimestamp(item.label)]));
  for (const token of layer2) {
    if (!token?.groupId || typeof token.text !== "string" || !token.text.trim()) continue;
    if (isInsideExcludedRegion(token, excludedRegions)) {
      groupsOverlappingEmbeddedSlips.add(token.groupId);
      continue;
    }
    const tokens = grouped.get(token.groupId) || [];
    tokens.push(token);
    grouped.set(token.groupId, tokens);
  }

  return [...grouped].map(([groupId, tokens]) => {
    const rows = [];
    for (const token of tokens.sort((a, b) => (a.bounds?.y ?? 0) - (b.bounds?.y ?? 0) || (a.bounds?.x ?? 0) - (b.bounds?.x ?? 0))) {
      const bounds = token.bounds;
      const centerY = bounds ? bounds.y + bounds.height / 2 : 0;
      const row = bounds && rows.find((candidate) => Math.abs(candidate.centerY - centerY) <= Math.max(bounds.height, candidate.height) * 0.55);
      if (row) {
        row.tokens.push(token);
        row.centerY = (row.centerY * (row.tokens.length - 1) + centerY) / row.tokens.length;
        row.height = Math.max(row.height, bounds?.height ?? 0);
      } else {
        rows.push({ centerY, height: bounds?.height ?? 0, tokens: [token] });
      }
    }

    const lines = rows.map((row) => {
      const ordered = row.tokens.sort((a, b) => (a.bounds?.x ?? 0) - (b.bounds?.x ?? 0));
      if (ordered.some((token) => token.unit === "line")) {
        return ordered.filter((token) => token.unit === "line").map((token) => token.text.trim()).join(" ");
      }
      if (ordered.every((token) => token.unit === "glyph")) {
        const sourceLines = new Map();
        for (const token of ordered) {
          if (typeof token.sourceLineText !== "string" || !token.sourceLineText.trim()) continue;
          const lineKey = Number.isInteger(token.sourceLineIndex) ? token.sourceLineIndex : token.sourceLineText;
          if (!sourceLines.has(lineKey)) sourceLines.set(lineKey, token.sourceLineText.trim());
        }
        if (sourceLines.size > 0) return [...sourceLines.values()].join(" ");

        return ordered.reduce((text, token, index) => {
          const previous = ordered[index - 1];
          const wordBoundary = index > 0
            && Number.isInteger(previous?.wordIndex)
            && Number.isInteger(token.wordIndex)
            && previous.wordIndex !== token.wordIndex;
          return `${text}${wordBoundary ? " " : ""}${token.text.trim()}`;
        }, "");
      }
      return ordered.map((token) => token.text.trim()).filter(Boolean).join(" ");
    }).filter(Boolean);
    return {
      groupId,
      lines,
      eventTimestamp: timestampsByGroup.get(groupId) ?? null,
      overlapsEmbeddedSlip: groupsOverlappingEmbeddedSlips.has(groupId),
    };
  });
}

function parseSlipTimestamp(date, time) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof time !== "string" || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const timestamp = Date.parse(`${date}T${normalizedTime}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function timestampProximityMinutes(slip, group) {
  const slipTimestamp = parseSlipTimestamp(slip.date, slip.time);
  const chatValue = typeof group.eventTimestamp === "string"
    ? /(?:Z|[+-]\d{2}:\d{2})$/u.test(group.eventTimestamp) ? group.eventTimestamp : `${group.eventTimestamp}Z`
    : null;
  const chatTimestamp = chatValue ? Date.parse(chatValue) : Number.NaN;
  if (slipTimestamp === null || !Number.isFinite(chatTimestamp)) return null;
  return Math.abs(slipTimestamp - chatTimestamp) / 60_000;
}

/**
 * @param {{ slips?: Array<{ id: string; amount: number | null; referenceNo: string | null; date?: string | null; time?: string | null }>, chatPages?: Array<{ sourceItemId?: string; pageNumber: number; groups: Array<{ groupId: string; lines: string[]; eventTimestamp?: string | null }> }>, visualMatches?: Array<{ chatSlipId: string; masterSlipId: string; chatSourceItemId?: string; chatPageNumber: number | null; distance: number }> }} input
 * @returns {ChatSlipCorroborationCandidate[]}
 */
export function findChatSlipCorroborationCandidates({ slips = [], chatPages = [], visualMatches = [] } = {}) {
  const candidates = [];
  const slipIds = new Set(slips.map((slip) => slip.id));

  for (const slip of slips) {
    const amount = amountToSatang(slip.amount);
    const reference = slip.referenceNo && !SYNTHETIC_REFERENCE.test(slip.referenceNo.trim())
      ? normalizeReference(slip.referenceNo)
      : "";
    if (!amount && !reference) continue;

    for (const page of chatPages) {
      for (const group of page.groups || []) {
        if (group.overlapsEmbeddedSlip) continue;
        const text = (group.lines || []).filter((line) => typeof line === "string").join(" ").trim();
        if (!text) continue;

        const exactReference = reference.length >= 8 && containsCompleteReference(text, reference);
        const hasTransferIntent = TRANSFER_INTENT.test(text);
        const hasLegalIntent = LEGAL_INTENT.test(text);
        const hasExplicitTransferIntent = EXPLICIT_TRANSFER_INTENT.test(text);
        const hasConfirmationIntent = TRANSFER_CONFIRMATION_INTENT.test(text);
        const timeProximityMinutes = timestampProximityMinutes(slip, group);
        const timeWindowValidated = timeProximityMinutes !== null
          && timeProximityMinutes <= MAX_TIMESTAMP_PROXIMITY_MINUTES;
        const confirmationOnlyIntent = hasConfirmationIntent && !hasTransferIntent && !hasLegalIntent;
        const amountAndIntent = amount !== null
          && amountsInText(text).has(amount)
          && (hasTransferIntent || hasLegalIntent || (confirmationOnlyIntent && timeWindowValidated));
        if (amountAndIntent && timeProximityMinutes !== null && !timeWindowValidated && !exactReference) continue;
        if (!exactReference && !amountAndIntent) continue;

        candidates.push({
          slipId: slip.id,
          chatPageNumber: page.pageNumber,
          ...(page.sourceItemId ? { chatSourceItemId: page.sourceItemId } : {}),
          groupId: group.groupId,
          matchBasis: exactReference
            ? "exact_reference"
            : hasLegalIntent && !hasExplicitTransferIntent
              ? timeWindowValidated ? "amount_with_legal_intent_and_time_window" : "amount_with_legal_intent"
              : hasTransferIntent && timeWindowValidated
                ? "amount_with_transfer_intent_and_time_window"
                : hasTransferIntent
                  ? "amount_with_transfer_intent"
                  : "amount_with_confirmation_and_time_window",
          timeProximityMinutes,
          timeWindowValidated,
          timestampOutsideWindow: exactReference && timeProximityMinutes !== null && !timeWindowValidated,
          evidenceText: text.slice(0, 500),
          needsReview: true,
        });
      }
    }
  }

  for (const match of visualMatches) {
    if (
      !match.chatSlipId
      || match.chatSlipId === match.masterSlipId
      || !slipIds.has(match.masterSlipId)
      || typeof match.chatPageNumber !== "number"
      || !Number.isInteger(match.chatPageNumber)
      || match.chatPageNumber < 1
      || !Number.isInteger(match.distance)
      || match.distance < 0
      || match.distance > MAX_VISUAL_SIMILARITY_DISTANCE
    ) continue;
    candidates.push({
      slipId: match.masterSlipId,
      chatPageNumber: match.chatPageNumber,
      ...(match.chatSourceItemId ? { chatSourceItemId: match.chatSourceItemId } : {}),
      groupId: `visual-${match.chatSlipId}`,
      matchBasis: "visual_similarity",
      evidenceText: "",
      needsReview: true,
      similarityDistance: match.distance,
    });
  }

  return candidates;
}

export function getCorroborationBasisLabel(candidate) {
  if (candidate.matchBasis === "exact_reference") {
    return candidate.timestampOutsideWindow === true ? "Ref ตรงกัน · เวลาเกิน 15 นาที" : "Ref ตรงกัน";
  }
  if (candidate.matchBasis === "amount_with_transfer_intent_and_time_window") {
    return `ยอด + คำโอน · ${candidate.timeProximityMinutes ?? "ไม่ทราบ"} นาที`;
  }
  if (candidate.matchBasis === "amount_with_transfer_intent") return "ยอด + คำโอน · ไม่มีเวลาเทียบ";
  if (candidate.matchBasis === "amount_with_legal_intent_and_time_window") {
    return `ยอด + ข้อความกู้ยืม/หนี้ · ${candidate.timeProximityMinutes ?? "ไม่ทราบ"} นาที`;
  }
  if (candidate.matchBasis === "amount_with_legal_intent") return "ยอด + ข้อความกู้ยืม/หนี้ · ไม่มีเวลาเทียบ";
  if (candidate.matchBasis === "amount_with_confirmation_and_time_window") {
    return `ยอด + ข้อความยืนยัน · ${candidate.timeProximityMinutes ?? "ไม่ทราบ"} นาที`;
  }
  return `ภาพคล้าย pHash d=${candidate.similarityDistance ?? "ไม่ทราบ"}`;
}

