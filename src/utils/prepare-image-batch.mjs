const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function prepareImageBatch(items) {
  const sorted = [...items].sort((left, right) => naturalOrder.compare(left.fileName, right.fileName));
  const masterByHash = new Map();

  return sorted.map((item) => {
    const hash = typeof item.sha256 === "string" ? item.sha256.trim().toLowerCase() : "";
    const duplicateOfId = hash ? masterByHash.get(hash) || null : null;
    if (hash && !duplicateOfId) masterByHash.set(hash, item.id);
    return { ...item, isDuplicate: Boolean(duplicateOfId), duplicateOfId };
  });
}

function getWindowsRenamePrefix(fileName) {
  const stem = String(fileName || "").replace(/\.[^.]+$/u, "");
  const withoutCopySuffix = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/iu, "");
  const match = /^(.*?)(?:\s*-\s*|\s*)\(\d+\)$/u.exec(withoutCopySuffix);
  const prefix = match?.[1]?.trim().replace(/[-_\s]+$/u, "") || "";
  return prefix || null;
}

export function groupImageBatchByPrefix(items) {
  const groupsByKey = new Map();

  for (const item of items) {
    const prefix = getWindowsRenamePrefix(item.fileName);
    const key = prefix ? `prefix:${prefix.toLocaleLowerCase()}` : `file:${item.id}`;
    const group = groupsByKey.get(key) || { prefix, files: [] };
    group.files.push(item);
    groupsByKey.set(key, group);
  }

  return Array.from(groupsByKey.values());
}

export function buildNamedCaseOutputPlans(items) {
  const groups = groupImageBatchByPrefix(items);
  const usedStems = new Set();

  return groups.map((group) => {
    const label = group.prefix || String(group.files[0]?.fileName || "evidence").replace(/\.[^.]+$/u, "");
    const baseStem = label.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_").replace(/[. ]+$/u, "").trim() || "evidence";
    let outputStem = baseStem;
    let suffix = 2;
    while (usedStems.has(outputStem.toLocaleLowerCase())) outputStem = `${baseStem}_${suffix++}`;
    usedStems.add(outputStem.toLocaleLowerCase());

    return {
      label,
      outputStem,
      itemIds: prepareImageBatch(group.files).map((item) => item.id),
    };
  });
}
