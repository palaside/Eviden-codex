import { classifyChatTextGroup } from "./chat-semantic-heuristics.mjs";

const MIN_PADDING = 8;
const MAX_PADDING = 20;

export function formatLayer2ReviewItem(item) {
  return {
    label: `Layer 2 · ${item.unit} · ${Math.round(item.confidence * 100)}% · group ${item.groupId}`,
    text: item.text,
    ...(typeof item.sourceLineText === "string" ? { sourceLineText: item.sourceLineText } : {}),
    boundsLabel: `กรอบหน้า: ${item.bounds.x},${item.bounds.y} ${item.bounds.width}×${item.bounds.height}`,
    streamBoundsLabel: `กรอบ stream: ${item.streamBounds.x},${item.streamBounds.y} ${item.streamBounds.width}×${item.streamBounds.height}`,
  };
}

/**
 * Builds review-only text object candidates from OCR line boxes.
 * It does not claim bubble direction or classify non-text attachments.
 */
export function segmentOcrTextLines(lines, imageSize, visualCandidates = []) {
  const validLines = lines
    .filter((line) => typeof line.text === "string" && line.text.trim() && isValidBounds(line.bounds))
    .map((line) => ({ ...line, text: line.text.trim() }))
    .sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
  const temporalLines = validLines.filter((line) => isStandaloneTimeMarker(line.text));
  const messageLines = validLines.filter((line) => !isStandaloneTimeMarker(line.text));

  const groups = [];
  for (const line of messageLines) {
    const previous = groups.at(-1);
    if (previous && shouldJoin(previous, line, imageSize.width)) {
      previous.lines.push(line);
      previous.bounds = unionBounds(previous.bounds, line.bounds);
      continue;
    }
    groups.push({ bounds: { ...line.bounds }, lines: [line] });
  }

  const layer1 = groups.map((group, index) => {
    const id = `text-block-${index + 1}`;
    const padding = Math.max(MIN_PADDING, Math.min(MAX_PADDING, Math.round(group.bounds.height * 0.2)));
    const bounds = clampBounds(expandBounds(group.bounds, padding), imageSize);
    const semantic = classifyChatTextGroup(group.lines, imageSize);
    return {
      id,
      kind: "text_message_candidate",
      bounds,
      confidence: averageConfidence(group.lines),
      needsReview: true,
      detectionMethod: "ocr_line_cluster",
      objectTypeCandidate: semantic.semanticClass,
      semanticMethod: semantic.method,
      semanticRationale: semantic.rationale,
    };
  });

  const layer2 = groups.flatMap((group, index) => group.lines.flatMap((line, linePosition) => {
    const words = Array.isArray(line.words)
      ? line.words.filter((word) => typeof word.text === "string" && word.text.trim() && isValidBounds(word.bounds))
      : [];
    const symbols = words.flatMap((word, wordIndex) => Array.isArray(word.symbols)
      ? word.symbols
        .filter((symbol) => typeof symbol.text === "string" && symbol.text.trim() && isValidBounds(symbol.bounds))
        .map((symbol) => ({ ...symbol, wordIndex }))
      : []);
    const elements = symbols.length
      ? symbols.map((symbol) => ({ ...symbol, unit: "glyph" }))
      : words.length
        ? words.map((word) => ({ ...word, unit: "word" }))
        : [{ ...line, unit: "line" }];
    return elements.map((element) => ({
      groupId: layer1[index].id,
      unit: element.unit,
      ...(Number.isInteger(element.wordIndex) ? { wordIndex: element.wordIndex } : {}),
      ...(typeof line.text === "string" && line.text.trim()
        ? { sourceLineText: line.text.trim(), sourceLineIndex: Number.isInteger(line.index) ? line.index : linePosition }
        : {}),
      text: element.text.trim(),
      confidence: clampConfidence(element.confidence),
      bounds: clampBounds(element.bounds, imageSize),
    }));
  }));

  const visualLayer = visualCandidates.map((candidate, index) => {
    let relatedGroup = Number.isInteger(candidate.relatedLineIndex)
      ? groups.find((group) => group.lines.some((line) => line.index === candidate.relatedLineIndex))
      : null;
    if (!relatedGroup && candidate.objectTypeCandidate === "avatar_or_icon_candidate") {
      relatedGroup = findAdjacentTextGroup(candidate.bounds, groups);
    }
    const id = `visual-region-${index + 1}`;
    return {
      id,
      kind: candidate.kind || "visual_region_candidate",
      bounds: clampBounds(candidate.bounds, imageSize),
      confidence: clampConfidence(candidate.confidence),
      needsReview: true,
      detectionMethod: candidate.detectionMethod || "opencv_adaptive_mask_contour",
      supportingDetectionMethods: candidate.supportingDetectionMethods,
      objectTypeCandidate: candidate.objectTypeCandidate || "unclassified_visual_region",
      semanticMethod: candidate.semanticMethod || "heuristic",
      semanticRationale: candidate.semanticRationale || "ไม่พบเหตุผลประกอบการจัดประเภท",
      foregroundRatio: candidate.foregroundRatio,
      relatedTextGroupId: relatedGroup ? layer1[groups.indexOf(relatedGroup)].id : null,
    };
  });
  const timestampLayer = temporalLines.map((line, index) => {
    const id = `timestamp-marker-${index + 1}`;
    const relatedGroupIndex = findNearestGroupIndex(line, groups);
    return {
      id,
      kind: "timestamp_marker_candidate",
      label: line.text,
      objectTypeCandidate: /^\d{1,2}[:.]\d{2}/u.test(line.text.trim()) ? "timestamp_marker_candidate" : "date_separator_candidate",
      semanticMethod: "heuristic",
      semanticRationale: "อ่านข้อความที่ตรงรูปแบบวัน/เวลาจาก OCR; ต้องตรวจว่าตรงกับเวลาเหตุการณ์",
      bounds: clampBounds(line.bounds, imageSize),
      confidence: clampConfidence(line.confidence),
      needsReview: true,
      detectionMethod: "ocr_timestamp_line_pattern",
      relatedTextGroupId: relatedGroupIndex >= 0 ? layer1[relatedGroupIndex].id : null,
    };
  });
  timestampLayer.forEach((marker) => layer2.push({
    groupId: marker.id,
    unit: "line",
    text: marker.label,
    confidence: marker.confidence,
    bounds: marker.bounds,
  }));

  return { layer1: [...layer1, ...visualLayer, ...timestampLayer], layer2 };
}

function isStandaloneTimeMarker(text) {
  const value = text.trim();
  return /^(?:\d{1,2}[:.]\d{2}(?:\s*(?:น\.?|am|pm))?|(?:วันนี้|เมื่อวาน|\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*\d{2,4})(?:\s+\d{1,2}[:.]\d{2})?)$/i.test(value);
}

function findNearestGroupIndex(line, groups) {
  let nearest = -1;
  let nearestDistance = Infinity;
  const lineCenter = line.bounds.y + line.bounds.height / 2;
  groups.forEach((group, index) => {
    const groupCenter = group.bounds.y + group.bounds.height / 2;
    const distance = Math.abs(groupCenter - lineCenter);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearestDistance <= Math.max(120, line.bounds.height * 6) ? nearest : -1;
}

function findAdjacentTextGroup(bounds, groups) {
  const centerY = bounds.y + bounds.height / 2;
  let best = null;
  for (const group of groups) {
    const groupCenterY = group.bounds.y + group.bounds.height / 2;
    const verticalDistance = Math.abs(centerY - groupCenterY);
    const horizontalDistance = Math.max(0, group.bounds.x - (bounds.x + bounds.width), bounds.x - (group.bounds.x + group.bounds.width));
    const limit = Math.max(30, group.bounds.height * 1.5);
    if (verticalDistance > limit || horizontalDistance > Math.max(70, group.bounds.width * 0.35)) continue;
    const score = verticalDistance + horizontalDistance;
    if (!best || score < best.score) best = { group, score };
  }
  return best?.group || null;
}

function shouldJoin(group, line, imageWidth) {
  const verticalGap = line.bounds.y - (group.bounds.y + group.bounds.height);
  const maxVerticalGap = Math.max(10, Math.min(group.bounds.height, line.bounds.height) * 0.8);
  const horizontalGap = Math.max(
    0,
    Math.max(group.bounds.x, line.bounds.x)
      - Math.min(group.bounds.x + group.bounds.width, line.bounds.x + line.bounds.width),
  );
  const minimumHorizontalOverlap = Math.min(group.bounds.width, line.bounds.width) * 0.12;
  const horizontalOverlap = Math.min(group.bounds.x + group.bounds.width, line.bounds.x + line.bounds.width)
    - Math.max(group.bounds.x, line.bounds.x);
  return verticalGap >= -Math.max(4, line.bounds.height * 0.25)
    && verticalGap <= maxVerticalGap
    && (horizontalOverlap >= minimumHorizontalOverlap || horizontalGap <= Math.max(12, imageWidth * 0.025));
}

function unionBounds(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const rightEdge = Math.max(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

function expandBounds(bounds, padding) {
  return { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
}

function clampBounds(bounds, imageSize) {
  const x = Math.max(0, Math.min(imageSize.width, bounds.x));
  const y = Math.max(0, Math.min(imageSize.height, bounds.y));
  const right = Math.max(x, Math.min(imageSize.width, bounds.x + bounds.width));
  const bottom = Math.max(y, Math.min(imageSize.height, bounds.y + bounds.height));
  return { x, y, width: right - x, height: bottom - y };
}

function averageConfidence(lines) {
  return lines.reduce((sum, line) => sum + clampConfidence(line.confidence), 0) / lines.length;
}

function clampConfidence(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function isValidBounds(bounds) {
  return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0 && bounds.height > 0;
}
