export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(limit)));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

export async function runQrThenOcrPasses<TPage, TQr, TResult>(
  pages: TPage[],
  concurrency: number,
  detectQr: (page: TPage, index: number) => Promise<TQr>,
  processOcr: (page: TPage, qrResult: TQr, index: number) => Promise<TResult>,
  onPhase?: (phase: "qr" | "ocr") => void,
): Promise<TResult[]> {
  onPhase?.("qr");
  const qrResults = await mapWithConcurrency(pages, concurrency, detectQr);
  onPhase?.("ocr");
  return mapWithConcurrency(pages, concurrency, (page, index) => processOcr(page, qrResults[index], index));
}
