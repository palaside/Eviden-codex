/**
 * @param {Array<{id: string, isDuplicate?: boolean, file: File}>} items
 * @param {(file: File) => Promise<import("./detect-image-type").DetectResult>} detectImageType
 * @returns {Promise<Array<[string, import("./detect-image-type").DetectResult]>>}
 */
export async function classifyUniqueEvidenceItems(items, detectImageType) {
  return Promise.all(items
    .filter((item) => !item.isDuplicate)
    .map(async (item) => [item.id, await detectImageType(item.file)]));
}
