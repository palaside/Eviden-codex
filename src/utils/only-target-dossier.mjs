function parseDateTime(dateValue, timeValue) {
  if (!dateValue) return null;
  const date = String(dateValue).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  const local = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(date);
  let year, month, day;
  if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); }
  else if (local) {
    day = Number(local[1]); month = Number(local[2]); year = Number(local[3]);
    if (year >= 2400) year -= 543;
  } else return null;
  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(timeValue || "").trim());
  const hour = time ? Number(time[1]) : 0;
  const minute = time ? Number(time[2]) : 0;
  const second = time?.[3] ? Number(time[3]) : 0;
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return timestamp;
}

export function selectTargetDossierRecords(records, targetName) {
  return records.flatMap((record, inputIndex) => {
    const fromTarget = isExactTargetMatch(record.data?.sender?.name, targetName);
    const toTarget = isExactTargetMatch(record.data?.receiver?.name, targetName);
    if (!fromTarget && !toTarget) return [];
    const txn = record.data?.transaction;
    const direction = fromTarget && toTarget ? "BOTH" : fromTarget ? "OUT" : "IN";
    return [{ ...record, record, id: record.id, direction, sortTimestamp: parseDateTime(txn?.date, txn?.time), inputIndex }];
  }).sort((a, b) => {
    if (a.sortTimestamp === null && b.sortTimestamp !== null) return 1;
    if (a.sortTimestamp !== null && b.sortTimestamp === null) return -1;
    return a.sortTimestamp !== null && b.sortTimestamp !== null
      ? a.sortTimestamp - b.sortTimestamp || a.inputIndex - b.inputIndex
      : a.inputIndex - b.inputIndex;
  });
}
import { isExactTargetMatch } from "./target-matcher.ts";

