const FILE_CUE = /(?:\.pdf|\.docx?|\.xlsx?|\.pptx?|\.zip|\.rar|\b\d+(?:\.\d+)?\s*(?:kb|mb|gb)\b|ไฟล์|เอกสารแนบ|ดาวน์โหลด)/iu;
const MEDIA_CUE = /(?:รูปภาพ|ภาพถ่าย|วิดีโอ|คลิป|อัลบั้ม|photo|video|image)/iu;
const COMPOSER_CUE = /(?:พิมพ์ข้อความ|เขียนข้อความ|message\.\.\.|type a message)/iu;
const STATUS_CUE = /(?:\b(?:wifi|wi-fi|4g|5g|lte|ais|dtac|true)\b|\d{1,2}:\d{2}.*(?:%|แบต|battery)|(?:%|แบต|battery).*\d{1,2}:\d{2})/iu;

export const CHAT_SEMANTIC_TAXONOMY = Object.freeze([
  "incoming_text_bubble_candidate", "outgoing_text_bubble_candidate", "date_separator_candidate",
  "timestamp_marker_candidate", "image_candidate", "image_album_candidate", "video_candidate",
  "sticker_candidate", "animated_sticker_candidate", "file_card_candidate", "voice_message_candidate",
  "audio_file_candidate", "link_preview_candidate", "contact_card_candidate", "location_candidate",
  "reaction_candidate", "avatar_or_icon_candidate", "system_notice_candidate", "forwarded_message_candidate",
  "quoted_reply_candidate", "poll_candidate", "call_log_candidate", "unknown_visual_candidate",
]);

export function classifyChatTextGroup(lines, imageSize) {
  const text = lines.map((line) => line.text).join(" ").trim();
  const bounds = lines.reduce((box, line) => box
    ? union(box, line.bounds)
    : { ...line.bounds }, null);
  const rules = [
    [/^(?:วันนี้|เมื่อวาน|\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.))/iu, "date_separator_candidate", 0.84, "ข้อความ OCR ตรงรูปแบบตัวแบ่งวัน"],
    [/^(?:ส่งต่อ|forwarded|forward:)/iu, "forwarded_message_candidate", 0.75, "พบคำบ่งชี้การส่งต่อใน OCR"],
    [/(?:ตอบกลับ|กำลังตอบกลับ|replied to|replying to)/iu, "quoted_reply_candidate", 0.68, "พบคำบ่งชี้ข้อความตอบกลับใน OCR"],
    [/(?:โหวต|แบบสำรวจ|poll|ตัวเลือก)/iu, "poll_candidate", 0.66, "พบคำบ่งชี้แบบสำรวจใน OCR"],
    [/(?:โทรเสียง|วิดีโอคอล|สายที่ไม่ได้รับ|missed call|voice call|video call)/iu, "call_log_candidate", 0.74, "พบคำบ่งชี้บันทึกการโทรใน OCR"],
    [/(?:ตำแหน่งที่ตั้ง|แชร์โลเคชัน|location|พิกัด)/iu, "location_candidate", 0.70, "พบคำบ่งชี้ตำแหน่งที่ตั้งใน OCR"],
    [/(?:บัตรผู้ติดต่อ|เพิ่มรายชื่อ|contact card|เบอร์โทรศัพท์)/iu, "contact_card_candidate", 0.68, "พบคำบ่งชี้ข้อมูลผู้ติดต่อใน OCR"],
    [/(?:ข้อความระบบ|เข้าร่วมกลุ่ม|ออกจากกลุ่ม|เปลี่ยนชื่อกลุ่ม|joined the group|left the group)/iu, "system_notice_candidate", 0.72, "พบข้อความสถานะระบบใน OCR"],
    [/https?:\/\/|www\./iu, "link_preview_candidate", 0.68, "พบ URL ใน OCR"],
    [/(?:สติกเกอร์|sticker)/iu, "sticker_candidate", 0.72, "พบคำบ่งชี้สติกเกอร์ใน OCR"],
    [/(?:เคลื่อนไหว|animated sticker|GIF)/iu, "animated_sticker_candidate", 0.65, "พบคำบ่งชี้สื่อเคลื่อนไหวใน OCR"],
    [/(?:ข้อความเสียง|voice message|กดเพื่อฟัง)/iu, "voice_message_candidate", 0.70, "พบคำบ่งชี้ข้อความเสียงใน OCR"],
    [/(?:ไฟล์เสียง|audio file|\.mp3|\.m4a|\.wav)/iu, "audio_file_candidate", 0.73, "พบคำบ่งชี้ไฟล์เสียงใน OCR"],
    [/(?:วิดีโอ|คลิป|\.mp4|\.mov)/iu, "video_candidate", 0.73, "พบคำบ่งชี้วิดีโอใน OCR"],
    [/(?:รูปภาพ|อัลบั้ม|photos|images|\d+\s*รูป)/iu, "image_album_candidate", 0.65, "พบคำบ่งชี้ชุดรูปภาพใน OCR"],
    [/(?:👍|❤️|😂|😮|😢|😡|reaction|ความรู้สึก)/u, "reaction_candidate", 0.54, "พบ emoji หรือคำบ่งชี้ reaction ใน OCR"],
  ];
  for (const [pattern, semanticClass, confidence, rationale] of rules) {
    if (pattern.test(text)) return candidate(semanticClass, confidence, rationale, lines[0]?.index ?? null);
  }
  const right = bounds.x + bounds.width / 2 > imageSize.width * 0.55;
  return candidate(
    right ? "outgoing_text_bubble_candidate" : "incoming_text_bubble_candidate",
    0.42,
    `คาดทิศทางจากตำแหน่งกรอบ OCR ${right ? "ด้านขวา" : "ด้านซ้าย"}; ไม่ได้ตรวจขอบ bubble หรือผู้ส่งจริง`,
    lines[0]?.index ?? null,
  );
}

export function classifyChatRegion(region, lines, imageSize) {
  const bounds = region.bounds;
  const matched = lines.filter((line) => overlapRatio(bounds, line.bounds) >= 0.25);
  const nearby = matched.length ? matched : lines.filter((line) => distance(bounds, line.bounds) <= Math.max(18, bounds.height * 0.7));
  const text = nearby.map((line) => line.text).join(" ").trim();
  const areaRatio = bounds.width * bounds.height / Math.max(1, imageSize.width * imageSize.height);
  const aspect = bounds.width / Math.max(1, bounds.height);
  const circularity = region.perimeter > 0 ? Math.min(1, (4 * Math.PI * region.contourArea) / (region.perimeter ** 2)) : 0;

  const evidenceLineIndex = (matched[0] || nearby[0])?.index ?? null;
  if (FILE_CUE.test(text)) return candidate("file_card_candidate", 0.78, "OCR ภายใน/ใกล้กรอบมีนามสกุลไฟล์ ขนาดไฟล์ หรือคำบ่งชี้ไฟล์", evidenceLineIndex);
  if (MEDIA_CUE.test(text) && areaRatio > 0.025) return candidate("image_or_album_candidate", 0.68, "OCR ใกล้กรอบมีคำเกี่ยวกับรูปภาพ/วิดีโอ และกรอบมีขนาดใหญ่", evidenceLineIndex);
  if (matched.length) return candidate("text_bubble_candidate", 0.62, "มีกรอบ OCR อยู่ภายใน contour; เป็นการคาดจากตำแหน่ง ไม่ใช่โมเดลจำแนกบับเบิล", evidenceLineIndex);
  if (circularity >= 0.68 && areaRatio < 0.025 && bounds.width / Math.max(1, imageSize.width) < 0.16) {
    return candidate("avatar_or_icon_candidate", 0.54, "รูปร่างค่อนข้างกลมและมีขนาดเล็ก; แยก avatar ออกจาก icon ไม่ได้ด้วย heuristic นี้", evidenceLineIndex);
  }
  if (areaRatio > 0.025 && aspect > 0.55 && aspect < 1.8) return candidate("image_or_sticker_candidate", 0.48, "กรอบภาพขนาดใหญ่และสัดส่วนใกล้สี่เหลี่ยม; แยกรูปภาพกับสติกเกอร์ไม่ได้", evidenceLineIndex);
  return candidate("unknown_visual_candidate", 0.25, "ไม่พบ cue เพียงพอสำหรับจัดประเภทวัตถุ", evidenceLineIndex);
}

export function detectChatChromeTrim(lines, imageSize, { isFirst, isLast }) {
  const ordered = [...lines].sort((a, b) => a.bounds.y - b.bounds.y);
  const statusLine = ordered.find((line) => line.bounds.y <= imageSize.height * 0.12 && STATUS_CUE.test(line.text));
  const composerLine = [...ordered].reverse().find((line) => line.bounds.y >= imageSize.height * 0.78 && COMPOSER_CUE.test(line.text));
  const top = !isFirst && statusLine
    ? Math.min(Math.round(imageSize.height * 0.24), Math.ceil(statusLine.bounds.y + statusLine.bounds.height + imageSize.height * 0.08))
    : 0;
  const bottom = !isLast && composerLine
    ? Math.max(Math.round(imageSize.height * 0.76), Math.floor(composerLine.bounds.y - imageSize.height * 0.05))
    : imageSize.height;
  const warnings = [];
  if (!isFirst && !statusLine) warnings.push("ไม่พบ OCR cue ของ status/header; ไม่ตัดขอบบนเพื่อรักษาพยานหลักฐาน");
  if (!isLast && !composerLine) warnings.push("ไม่พบ OCR cue ของ composer/footer; ไม่ตัดขอบล่างเพื่อรักษาพยานหลักฐาน");
  return {
    top,
    bottom: Math.max(top, bottom),
    topMethod: top ? "ocr_ui_cue" : "preserved",
    bottomMethod: bottom < imageSize.height ? "ocr_ui_cue" : "preserved",
    topEvidence: top ? statusLine.text : null,
    bottomEvidence: bottom < imageSize.height ? composerLine.text : null,
    warnings,
  };
}

function candidate(semanticClass, confidence, rationale, evidenceLineIndex = null) {
  return { semanticClass, method: "heuristic", confidence, needsReview: true, rationale, evidenceLineIndex };
}

function overlapRatio(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height / Math.max(1, b.width * b.height);
}

function distance(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}
