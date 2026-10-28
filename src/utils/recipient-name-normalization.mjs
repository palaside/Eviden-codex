const titlePrefixes = [
  "พล.ต.อ.หญิง", "พล.ต.อ.", "พล.ต.ท.หญิง", "พล.ต.ท.", "พล.ต.ต.หญิง", "พล.ต.ต.",
  "พ.ต.อ.หญิง", "พ.ต.อ.", "พ.ต.ท.หญิง", "พ.ต.ท.", "พ.ต.ต.หญิง", "พ.ต.ต.",
  "ร.ต.อ.หญิง", "ร.ต.อ.", "ร.ต.ท.หญิง", "ร.ต.ท.", "ร.ต.ต.หญิง", "ร.ต.ต.",
  "ด.ต.หญิง", "ด.ต.", "จ.ส.ต.หญิง", "จ.ส.ต.", "ส.ต.อ.หญิง", "ส.ต.อ.", "ส.ต.ท.", "ส.ต.ต.",
  "พล.อ.", "พล.ท.", "พล.ต.", "พ.อ.", "พ.ท.", "พ.ต.", "ร.อ.", "ร.ท.", "ร.ต.",
  "จ.ส.อ.", "จ.ส.ท.", "จ.ส.ต.", "ส.อ.", "ส.ท.", "ส.ต.",
  "จ่าสิบเอก", "จ่าสิบโท", "จ่าสิบตรี", "สิบเอก", "สิบโท", "สิบตรี", "สืบตรี",
  "ว่าที่ ร.ต.", "ว่าที่ร.ต.",
  "ศ.ดร.", "รศ.ดร.", "ผศ.ดร.", "ศ.", "รศ.", "ผศ.", "ดร.", "นพ.", "พญ.", "ทพ.", "ทพญ.", "ภก.", "ภญ.", "อ.",
  "ม.ร.ว.", "ม.ล.", "ม.จ.", "หม่อมราชวงศ์", "หม่อมหลวง",
  "เด็กชาย", "เด็กหญิง", "ด.ช.", "ด.ญ.", "นางสาว", "น.ส.", "นาย", "นาง", "คุณ", "ท่าน",
  "บริษัท", "บจก.", "บมจ.", "ห้างหุ้นส่วนจำกัด", "หจก.", "ร้าน",
  "Mr.", "Mrs.", "Miss", "Ms.", "Dr.", "Prof.", "Pol.", "Gen.", "Col.", "Capt.",
];

titlePrefixes.sort((left, right) => right.length - left.length);

export function removeThaiTitlePrefix(rawName) {
  if (typeof rawName !== "string") return "";

  let clean = rawName.trim();
  const knownPrefix = titlePrefixes.find((candidate) => clean.replace(/^[0-9๐-๙]{1,4}\s+/, "").toLowerCase().startsWith(candidate.toLowerCase()));
  if (knownPrefix) clean = clean.replace(/^[0-9๐-๙]{1,4}\s+/, "");
  while (clean) {
    const prefix = titlePrefixes.find((candidate) => clean.toLowerCase().startsWith(candidate.toLowerCase()));
    if (!prefix) break;

    const remainder = clean.slice(prefix.length).trim();
    if (remainder.length < 2) break;
    clean = remainder;
  }

  return clean;
}
