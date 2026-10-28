export function countChatPagesWithEmbeddedSlips(items = []) {
  const pages = new Set();
  for (const item of items) {
    if (item?.category !== "CHAT" || !Array.isArray(item.embeddedSlips)) continue;
    for (const slip of item.embeddedSlips) {
      const page = Number.isInteger(slip?.chatPageNumber) ? slip.chatPageNumber : slip?.id;
      if (page !== undefined && page !== null) pages.add(`${item.id ?? "chat"}:${page}`);
    }
  }
  return pages.size;
}
