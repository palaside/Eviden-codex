function parseTlv(payload: string): Map<string, string> | null {
  if (payload.length < 4) return null;
  const fields = new Map<string, string>();
  let offset = 0;

  while (offset < payload.length) {
    const tag = payload.slice(offset, offset + 2);
    const lengthText = payload.slice(offset + 2, offset + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) return null;

    const valueLength = Number(lengthText);
    const valueStart = offset + 4;
    const valueEnd = valueStart + valueLength;
    if (valueEnd > payload.length) return null;
    fields.set(tag, payload.slice(valueStart, valueEnd));
    offset = valueEnd;
  }

  return fields.size ? fields : null;
}

function looksLikeCompactTimestamp(value: string): boolean {
  const match = value.match(/^(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\d+$/);
  if (!match) return false;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
    && date.getUTCHours() === Number(hour)
    && date.getUTCMinutes() === Number(minute)
    && date.getUTCSeconds() === Number(second);
}

function getEmvcoReference(payload: string): string | null {
  const outerFields = parseTlv(payload);
  if (!outerFields) return null;

  const nestedPayload = outerFields.get("00");
  const nestedReference = nestedPayload && nestedPayload.length >= 10
    ? parseTlv(nestedPayload)?.get("02")
    : null;
  const reference = nestedReference || null;
  return reference
    && /^[a-z0-9][a-z0-9_-]{3,}$/i.test(reference)
    && !looksLikeCompactTimestamp(reference)
    ? reference
    : null;
}

export function extractReferenceNo(payload: string): string | null {
  try {
    const url = new URL(payload);
    const reference = url.searchParams.get("ref")
      || url.searchParams.get("transId")
      || url.searchParams.get("id")
      || url.searchParams.get("referenceNo");
    if (reference) return reference;

    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    return last && last.length >= 8 ? last : null;
  } catch {}

  return getEmvcoReference(payload)
    ?? payload.match(/(?:ref(?:erence)?(?:no|id)?|transactionid)\s*[=:]\s*([a-z0-9][a-z0-9_-]{3,})/i)?.[1]
    ?? null;
}
