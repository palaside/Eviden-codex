export function extractEmvcoAmount(payload: string): number | null {
  let offset = 0;

  while (offset + 4 <= payload.length) {
    const tag = payload.slice(offset, offset + 2);
    const lengthText = payload.slice(offset + 2, offset + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) return null;

    const valueLength = Number(lengthText);
    const valueStart = offset + 4;
    const valueEnd = valueStart + valueLength;
    if (valueEnd > payload.length) return null;

    if (tag === "54") {
      const value = payload.slice(valueStart, valueEnd);
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
      const amount = Number(value);
      return Number.isFinite(amount) ? amount : null;
    }

    offset = valueEnd;
  }

  return null;
}
