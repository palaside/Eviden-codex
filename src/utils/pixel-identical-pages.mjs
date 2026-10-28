function pixelFingerprint(page, pixels) {
  let hash = 0x811c9dc5;
  const mix = (value) => {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  mix(page.width & 0xff);
  mix((page.width >>> 8) & 0xff);
  mix(page.height & 0xff);
  mix((page.height >>> 8) & 0xff);
  for (const value of pixels) mix(value);
  return hash;
}

function arePixelsEqual(left, leftPixels, right, rightPixels) {
  if (left.width !== right.width || left.height !== right.height || leftPixels.length !== rightPixels.length) return false;
  for (let index = 0; index < leftPixels.length; index += 1) {
    if (leftPixels[index] !== rightPixels[index]) return false;
  }
  return true;
}

export function buildUniquePixelJobPlan(jobs, groups, getJobId) {
  const representativeById = new Map();
  for (const group of groups) {
    const ids = group.map((page) => page.id).filter((id) => typeof id === "string" && id.length > 0);
    const representativeId = ids[0];
    if (!representativeId) continue;
    for (const id of ids.slice(1)) representativeById.set(id, representativeId);
  }

  const resolveRepresentative = (id) => {
    let current = id;
    const visited = new Set();
    while (representativeById.has(current) && !visited.has(current)) {
      visited.add(current);
      current = representativeById.get(current);
    }
    return current;
  };

  const uniqueJobs = [];
  const indexByRepresentative = new Map();
  const resultIndexes = jobs.map((job, index) => {
    const jobId = getJobId(job, index);
    const representativeId = typeof jobId === "string" && jobId.length > 0
      ? resolveRepresentative(jobId)
      : `__job_${index}`;
    if (!indexByRepresentative.has(representativeId)) {
      indexByRepresentative.set(representativeId, uniqueJobs.length);
      uniqueJobs.push(job);
    }
    return indexByRepresentative.get(representativeId);
  });

  return { jobs: uniqueJobs, resultIndexes };
}

export function expandUniquePixelJobResults(jobs, plan, results) {
  return plan.resultIndexes.map((resultIndex, jobIndex) => {
    const result = results[resultIndex];
    return jobs[jobIndex] === plan.jobs[resultIndex] ? result : structuredClone(result);
  });
}

export async function findPixelIdenticalPageGroups(pages) {
  const candidatesByFingerprint = new Map();
  for (const page of pages) {
    if (!Number.isInteger(page.width) || page.width < 1 || !Number.isInteger(page.height) || page.height < 1
      || typeof page.readPixels !== "function") continue;

    let pixels;
    try {
      pixels = await page.readPixels();
    } catch {
      continue;
    }
    if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray)
      || pixels.length !== page.width * page.height * 4) continue;
    const fingerprint = pixelFingerprint(page, pixels);
    const groups = candidatesByFingerprint.get(fingerprint) || [];
    let matchingGroup;
    for (const group of groups) {
      let representativePixels;
      try {
        representativePixels = await group[0].readPixels();
      } catch {
        continue;
      }
      if (arePixelsEqual(group[0], representativePixels, page, pixels)) {
        matchingGroup = group;
        break;
      }
    }
    if (matchingGroup) matchingGroup.push(page);
    else groups.push([page]);
    candidatesByFingerprint.set(fingerprint, groups);
  }
  return [...candidatesByFingerprint.values()].flat().filter((group) => group.length > 1);
}

export function buildPixelDuplicateWarnings(groups) {
  return groups.flatMap((group) => {
    const locations = group.map((page) => `${page.fileName} · หน้า ${page.pageNumber}`).join(" ↔ ");
    const warning = `พบหน้าที่พิกเซลตรงกันทุกจุด (ใช้ผล QR/OCR ร่วมกัน; เก็บ occurrence ทุกหน้า ไม่ตัดหลักฐาน): ${locations}`;
    return group.map((page) => ({ sourceItemId: page.sourceItemId, warning }));
  });
}
