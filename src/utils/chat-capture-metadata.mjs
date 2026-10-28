const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export async function readImageCaptureTime(file) {
  try {
    const header = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    return parseExifDateTime(new Uint8Array(header));
  } catch {
    return null;
  }
}

export function parseExifDateTime(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpegExif(bytes);
  return null;
}

export function sortChatInputsByCaptureTime(items) {
  const eventTimeComplete = items.length > 1 && items.every((item) => isValidEventTime(item.eventTime));
  const complete = items.every((item) => isValidCaptureTime(item.captureTime));
  const sorted = [...items].sort((left, right) => {
    if (eventTimeComplete) return left.eventTime.localeCompare(right.eventTime)
      || naturalOrder.compare(left.fileName, right.fileName);
    if (!complete) return naturalOrder.compare(left.fileName, right.fileName);
    return left.captureTime.localeCompare(right.captureTime)
      || naturalOrder.compare(left.fileName, right.fileName);
  });
  return {
    items: sorted,
    usedEventTime: eventTimeComplete,
    usedCaptureTime: !eventTimeComplete && complete && items.length > 1,
    warnings: items.length < 2
      ? []
      : eventTimeComplete
        ? ["เรียงตามวัน/เวลาที่ OCR อ่านได้จากตัวบ่งชี้ในภาพ; โปรดตรวจทานว่าเป็นเวลาของเหตุการณ์"]
        : complete
        ? ["เรียงตาม EXIF DateTime; เป็น metadata ของไฟล์ ไม่ยืนยันเวลาเหตุการณ์ และ EXIF อาจไม่มี timezone" ]
        : ["ไม่มี OCR event time หรือ EXIF time ครบทุกไฟล์; ใช้ลำดับชื่อไฟล์แบบ natural และไม่เดาเวลา"],
  };
}

const THAI_MONTHS = new Map([
  ["ม.ค.", 1], ["ก.พ.", 2], ["มี.ค.", 3], ["เม.ย.", 4], ["พ.ค.", 5], ["มิ.ย.", 6],
  ["ก.ค.", 7], ["ส.ค.", 8], ["ก.ย.", 9], ["ต.ค.", 10], ["พ.ย.", 11], ["ธ.ค.", 12],
]);

export function parseChatEventTimestamp(text) {
  if (typeof text !== "string") return null;
  const normalized = text.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .replace(/\s+/g, " ").trim();
  const match = /(?:^|\D)(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{2,4})(?:\D+)(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\D|$)/iu.exec(normalized);
  if (!match) return null;
  const [, dayText, monthText, yearText, hourText, minuteText, secondText = "00"] = match;
  const day = Number(dayText);
  const month = THAI_MONTHS.get(monthText);
  const rawYear = Number(yearText);
  const year = rawYear < 100 ? (rawYear >= 50 ? 1900 + rawYear : 2000 + rawYear) : rawYear >= 2400 ? rawYear - 543 : rawYear;
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day
    || hour > 23 || minute > 59 || second > 59) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export function findChatEventTimestamp(lines) {
  const ordered = [...lines].filter((line) => typeof line.text === "string" && line.bounds)
    .sort((left, right) => left.bounds.y - right.bounds.y);
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index];
    const direct = parseChatEventTimestamp(current.text);
    if (direct) return direct;
    const next = ordered[index + 1];
    if (!next) continue;
    const gap = next.bounds.y - (current.bounds.y + current.bounds.height);
    if (gap > Math.max(current.bounds.height, next.bounds.height) * 1.5) continue;
    const joined = parseChatEventTimestamp(`${current.text} ${next.text}`);
    if (joined) return joined;
  }
  return null;
}

function isValidEventTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value);
}

function parseJpegExif(bytes) {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = readU16(bytes, offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    const payload = offset + 4;
    if (marker === 0xe1 && ascii(bytes, payload, 6) === "Exif\0\0") {
      return parseTiffDate(bytes, payload + 6, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return null;
}

function parseTiffDate(bytes, base, limit) {
  if (base + 8 > limit) return null;
  const little = bytes[base] === 0x49 && bytes[base + 1] === 0x49;
  if (!little && !(bytes[base] === 0x4d && bytes[base + 1] === 0x4d)) return null;
  const u16 = (offset) => readU16(bytes, offset, little);
  const u32 = (offset) => readU32(bytes, offset, little);
  if (u16(base + 2) !== 42) return null;
  const firstIfd = base + u32(base + 4);
  const mainTags = readIfd(bytes, base, firstIfd, limit, u16, u32);
  let exifTags = new Map();
  const exifPointer = mainTags.get(0x8769)?.value;
  if (Number.isInteger(exifPointer)) exifTags = readIfd(bytes, base, base + exifPointer, limit, u16, u32);
  return formatExifDate(readAsciiTag(bytes, base, limit, exifTags.get(0x9003))
    || readAsciiTag(bytes, base, limit, mainTags.get(0x0132)));
}

function readIfd(bytes, base, ifd, limit, u16, u32) {
  const tags = new Map();
  if (ifd + 2 > limit) return tags;
  const count = u16(ifd);
  if (count > 512 || ifd + 2 + count * 12 > limit) return tags;
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const length = u32(entry + 4);
    const value = type === 3 && length === 1 ? u16(entry + 8) : u32(entry + 8);
    tags.set(tag, { type, length, value });
  }
  return tags;
}

function readAsciiTag(bytes, base, limit, tag) {
  if (!tag || tag.type !== 2 || tag.length > 64) return "";
  const data = tag.length <= 4 ? tag.value : base + tag.value;
  if (data < base || data + tag.length > limit) return "";
  return ascii(bytes, data, tag.length);
}

function formatExifDate(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.replace(/\0+$/, "").trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function isValidCaptureTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value);
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readU16(bytes, offset, little) {
  if (offset < 0 || offset + 2 > bytes.length) return -1;
  return little ? bytes[offset] | bytes[offset + 1] << 8 : bytes[offset] << 8 | bytes[offset + 1];
}

function readU32(bytes, offset, little) {
  if (offset < 0 || offset + 4 > bytes.length) return -1;
  return little
    ? (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0
    : (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
}
