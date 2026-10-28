import { isExactTargetMatch, stripThaiTitlePrefix } from "./target-matcher.ts";
import { buildChatOcrGroups } from "./chat-slip-corroboration.mjs";

const thaiWord = "[\\u0E00-\\u0E7E]{2,}";
const fullName = `(?:${thaiWord}\\s+${thaiWord}|[A-Za-z][A-Za-z'’-]{1,}(?:\\s+[A-Za-z][A-Za-z'’-]{1,})+)`;
const personTitles = [
  "พล\\.ต\\.อ\\.หญิง", "พล\\.ต\\.อ\\.", "พล\\.ต\\.ท\\.หญิง", "พล\\.ต\\.ท\\.", "พล\\.ต\\.ต\\.หญิง", "พล\\.ต\\.ต\\.",
  "พ\\.ต\\.อ\\.หญิง", "พ\\.ต\\.อ\\.", "พ\\.ต\\.ท\\.หญิง", "พ\\.ต\\.ท\\.", "พ\\.ต\\.ต\\.หญิง", "พ\\.ต\\.ต\\.",
  "ร\\.ต\\.อ\\.หญิง", "ร\\.ต\\.อ\\.", "ร\\.ต\\.ท\\.หญิง", "ร\\.ต\\.ท\\.", "ร\\.ต\\.ต\\.หญิง", "ร\\.ต\\.ต\\.",
  "นางสาว", "น\\.ส\\.", "เด็กชาย", "เด็กหญิง", "ด\\.ช\\.", "ด\\.ญ\\.", "ดร\\.", "นพ\\.", "พญ\\.", "ทพญ\\.", "ทพ\\.", "ภก\\.", "ภญ\\.",
  "นาย", "นาง", "คุณ", "ท่าน", "Mr\\.", "Mrs\\.", "Miss", "Ms\\.", "Dr\\.", "Prof\\.",
];
const organizationTitles = ["บริษัทมหาชนจำกัด", "บริษัทจำกัด", "บริษัท", "บมจ\\.", "บจก\\.", "ห้างหุ้นส่วนจำกัด", "หจก\\.", "ร้าน"];
const conversationalWords = new Set(["ช่วยกัน", "เดี๋ยวก็เสร็จ", "แจ้งว่า", "โอนเงิน", "โทรหา", "ส่งมา", "บอกว่า", "ช่วยส่ง"]);

function unionBounds(bounds) {
  if (bounds.length === 0) return null;
  return bounds.slice(1).reduce((current, next) => {
    const x = Math.min(current.x, next.x);
    const y = Math.min(current.y, next.y);
    const right = Math.max(current.x + current.width, next.x + next.width);
    const bottom = Math.max(current.y + current.height, next.y + next.height);
    return { x, y, width: right - x, height: bottom - y };
  }, { ...bounds[0] });
}

function isTokenInExcludedRegion(token, sourceItemId, regions) {
  return (token.sourceReferences || []).some((source) => {
    if (source.sourceItemId !== sourceItemId || !source.bounds) return false;
    return regions.some((region) => {
      if (region.sourceItemId !== sourceItemId || !region.bounds) return false;
      const centerX = source.bounds.x + source.bounds.width / 2;
      const centerY = source.bounds.y + source.bounds.height / 2;
      return centerX >= region.bounds.x && centerX <= region.bounds.x + region.bounds.width
        && centerY >= region.bounds.y && centerY <= region.bounds.y + region.bounds.height;
    });
  });
}

function findEntityMatches(text) {
  const matches = [];
  const labeled = new RegExp(`(?:ชื่อผู้ส่ง|ชื่อคู่สนทนา|ชื่อบุคคล)\\s*[:：]\\s*(${fullName})(?![\\u0E00-\\u0E7E])`, "giu");
  for (const match of text.matchAll(labeled)) {
    matches.push({ rawName: match[1], entityType: "PERSON" });
  }
  for (const title of personTitles) {
    const titlePattern = new RegExp(`(?:^|[\\s(,])(?:${title})\\s+(${fullName})(?![\\u0E00-\\u0E7E])`, "gimu");
    for (const match of text.matchAll(titlePattern)) {
      const rawName = match[1];
      if (rawName.split(/\s+/u).some((word) => conversationalWords.has(word))) continue;
      matches.push({ rawName, entityType: "PERSON" });
    }
  }
  const organizationPattern = new RegExp(`(?:^|[\\s(,])(?:${organizationTitles.join("|")})\\s*(${thaiWord}(?:\\s+${thaiWord})?\\s*(?:จำกัด|มหาชน)?)(?![\\u0E00-\\u0E7E])`, "giu");
  for (const match of text.matchAll(organizationPattern)) {
    matches.push({ rawName: match[1].trim(), entityType: "ORGANIZATION" });
  }
  return matches.flatMap((match) => {
    const cleanName = stripThaiTitlePrefix(match.rawName).replace(/\s+/g, " ").trim();
    const tokens = cleanName.split(/\s+/u).filter(Boolean);
    if (!cleanName || (match.entityType === "PERSON" && tokens.length < 2)) return [];
    return [{ ...match, cleanName }];
  });
}

function findKnownPersonMentions(text, knownPeople = []) {
  const mentions = [];
  const uniqueNames = new Map();
  for (const person of knownPeople) {
    const rawName = typeof person === "string" ? person : person?.cleanName || person?.rawName;
    const cleanName = stripThaiTitlePrefix(rawName).replace(/\s+/gu, " ").trim();
    if (cleanName.split(/\s+/u).length < 2) continue;
    const key = cleanName.toLocaleLowerCase();
    if (!uniqueNames.has(key)) uniqueNames.set(key, { rawName, cleanName });
  }

  for (const person of uniqueNames.values()) {
    const escaped = person.cleanName.split(/\s+/u).map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("\\s+");
    const pattern = new RegExp(`(?:^|[^\\p{L}])(${escaped})(?![\\p{L}])`, "giu");
    if (pattern.test(text)) mentions.push({ ...person, entityType: "PERSON", cleanName: person.cleanName });
  }
  return mentions;
}

/**
 * @param {Array<object>} pages
 * @param {Array<string | { cleanName?: string; rawName?: string }>} knownPeople
 */
export function discoverChatEntityOccurrences(pages = [], knownPeople = []) {
  const entities = [];
  for (const page of pages) {
    if (!page?.sourceItemId || !Number.isInteger(page.pageNumber) || page.pageNumber < 1) continue;
    const groups = buildChatOcrGroups(page.layer2 || [], page.excludedRegions || [], page.layer1 || []);
    const tokensByGroup = new Map();
    for (const token of page.layer2 || []) {
      if (!token?.groupId) continue;
      const groupTokens = tokensByGroup.get(token.groupId) || [];
      groupTokens.push(token);
      tokensByGroup.set(token.groupId, groupTokens);
    }
    for (const group of groups) {
      if (group.overlapsEmbeddedSlip) continue;
      const evidenceText = (group.lines || []).join(" ").trim();
      if (!evidenceText) continue;
      const groupTokens = tokensByGroup.get(group.groupId) || [];
      const confidence = groupTokens.length
        ? groupTokens.reduce((sum, token) => sum + (Number(token.confidence) || 0), 0) / groupTokens.length
        : 0;
      const references = new Map();
      for (const reference of groupTokens.flatMap((token) => token.sourceReferences || [])) {
        if (reference?.sourceItemId && reference.bounds) {
          const current = references.get(reference.sourceItemId) || [];
          current.push(reference);
          references.set(reference.sourceItemId, current);
        }
      }
      const sourceReferences = [...references].map(([sourceItemId, items]) => ({
        sourceItemId,
        fileName: items[0].fileName || "",
        sha256: items[0].sha256 || "",
        bounds: unionBounds(items.map((item) => item.bounds)),
      }));
      const sourceBounds = unionBounds((references.get(page.sourceItemId) || []).map((reference) => reference.bounds));

      for (const match of [...findEntityMatches(evidenceText), ...findKnownPersonMentions(evidenceText, knownPeople)]) {
        let entity = entities.find((item) => item.entityType === match.entityType && isExactTargetMatch(item.cleanName, match.cleanName));
        if (!entity) {
          entity = {
            id: `chat-entity-${entities.length + 1}`,
            rawName: match.rawName,
            cleanName: match.cleanName,
            entityType: match.entityType,
            needsReview: true,
            occurrences: [],
          };
          entities.push(entity);
        }
        const duplicate = entity.occurrences.some((occurrence) => occurrence.sourceItemId === page.sourceItemId
          && occurrence.pageNumber === page.pageNumber && occurrence.groupId === group.groupId);
        if (!duplicate) {
          entity.occurrences.push({
            sourceItemId: page.sourceItemId,
            fileName: page.fileName || "",
            pageNumber: page.pageNumber,
            groupId: group.groupId,
            evidenceText,
            confidence,
            bounds: sourceBounds,
            sourceReferences,
            needsReview: true,
          });
        }
      }
    }
  }
  return entities;
}

export function getChatEntityDiscoveryDiagnostics(pages = [], knownPeople = [], entities = null) {
  const validPages = pages.filter((page) => page?.sourceItemId
    && Number.isInteger(page.pageNumber) && page.pageNumber >= 1);
  const groups = validPages.flatMap((page) => buildChatOcrGroups(
    page.layer2 || [], page.excludedRegions || [], page.layer1 || [],
  ).map((group) => ({ ...group, sourceItemId: page.sourceItemId, pageNumber: page.pageNumber })));
  const excludedSlipGroups = new Set();
  for (const page of validPages) {
    for (const token of page.layer2 || []) {
      if (token?.groupId && isTokenInExcludedRegion(token, page.sourceItemId, page.excludedRegions || [])) {
        excludedSlipGroups.add(`${page.sourceItemId}\u0000${page.pageNumber}\u0000${token.groupId}`);
      }
    }
  }
  const textGroups = groups.filter((group) => !group.overlapsEmbeddedSlip
    && (group.lines || []).some((line) => typeof line === "string" && line.trim()));
  const matchedGroups = new Set((entities || discoverChatEntityOccurrences(validPages, knownPeople))
    .flatMap((entity) => entity.occurrences.map((occurrence) =>
      `${occurrence.sourceItemId}\u0000${occurrence.pageNumber}\u0000${occurrence.groupId}`)));
  const groupsWithNameCandidate = textGroups.filter((group) => matchedGroups.has(
    `${group.sourceItemId}\u0000${group.pageNumber}\u0000${group.groupId}`,
  )).length;

  return {
    chatPageCount: validPages.length,
    layer2UnitCount: validPages.reduce((sum, page) => sum + (Array.isArray(page.layer2) ? page.layer2.length : 0), 0),
    textGroupCount: textGroups.length,
    excludedSlipGroupCount: excludedSlipGroups.size,
    groupsWithNameCandidate,
    groupsWithoutNameCandidate: textGroups.length - groupsWithNameCandidate,
  };
}
