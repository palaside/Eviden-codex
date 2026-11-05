import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const SHA256 = /^[a-f0-9]{64}$/;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalInventory(inventory) {
  if (!Array.isArray(inventory)) throw new TypeError("inventory must be an array");
  return inventory.map((item) => {
    if (!SHA256.test(item?.sourceSha256 || "")) throw new TypeError("inventory requires source SHA-256");
    if (typeof item.fixturePath !== "string" || !item.fixturePath) throw new TypeError("inventory requires fixturePath");
    return stable(item);
  }).sort((a, b) => {
    const left = JSON.stringify(a);
    const right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function createBatchRunManifest({ runId, buildId, gitCommit, processingVersion, inventory, batches }) {
  for (const [field, value] of Object.entries({ runId, buildId, gitCommit, processingVersion })) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  }
  if (!Array.isArray(batches)) throw new TypeError("batches must be an array");
  const identity = { buildId, gitCommit, processingVersion, inventory: canonicalInventory(inventory), batches: stable(batches) };
  return {
    schema: "digital-evidence.batch500-run.v1",
    runId,
    runIdentity: createHash("sha256").update(JSON.stringify(stable(identity))).digest("hex"),
    ...identity,
  };
}

// Mutable checkpoint snapshots only. Immutable run evidence must use a fresh
// directory; callers must never use this replacement operation on prior traces.
export async function writeAtomicJson(filePath, value) {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) throw new TypeError("value must be JSON serializable");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, "wx");
  try {
    await handle.writeFile(`${json}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  // Same-directory rename publishes only a complete snapshot. On failure retain
  // the temporary file for inspection rather than deleting evidence.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(temporary, filePath);
      break;
    } catch (error) {
      // Windows readers can temporarily deny replacement of an open file.
      // Never unlink the destination: retain the old snapshot on failure.
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 5) throw error;
      await delay(20 * (attempt + 1));
    }
  }
}

export async function readCheckpoint(filePath) {
  let data;
  try {
    data = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const checkpoint = JSON.parse(data);
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    throw new TypeError("checkpoint must be a JSON object");
  }
  return checkpoint;
}

export function isCheckpointCompatible(checkpoint, manifest) {
  const reasons = [];
  if (!checkpoint || !manifest) return { compatible: false, reasons: ["checkpoint or manifest missing"] };
  for (const field of ["schema", "buildId", "gitCommit", "processingVersion", "runIdentity"]) {
    if (!checkpoint[field] || checkpoint[field] !== manifest[field]) reasons.push(`${field} mismatch or missing`);
  }
  try {
    if (JSON.stringify(canonicalInventory(checkpoint.inventory)) !== JSON.stringify(canonicalInventory(manifest.inventory))) reasons.push("inventory mismatch");
    if (!Array.isArray(checkpoint.batches) || JSON.stringify(stable(checkpoint.batches)) !== JSON.stringify(stable(manifest.batches))) reasons.push("batches mismatch");
    // Reject a stale identity even if both documents copied the same hash.
    for (const value of [checkpoint, manifest]) {
      if (createBatchRunManifest(value).runIdentity !== value.runIdentity) reasons.push("runIdentity does not match manifest contents");
    }
  } catch (error) {
    reasons.push(`invalid inventory or manifest: ${error.message}`);
  }
  return { compatible: reasons.length === 0, reasons };
}

function hasCompletedTrace(result) {
  if (result?.status !== "completed" || !SHA256.test(result.sourceSha256 || "") || !result.tracePath) return false;
  try {
    const trace = JSON.parse(readFileSync(result.tracePath, "utf8"));
    return Array.isArray(trace.items) && trace.items.some((item) => (
      item.source?.sha256 || item.sourceSha256
    ) === result.sourceSha256);
  } catch {
    return false;
  }
}

// Call isCheckpointCompatible first. Only completed processing with a readable,
// SHA-matching trace is resumable; review_required never becomes confirmed here.
export function getPendingFixtures(checkpoint, inventory) {
  canonicalInventory(inventory);
  const completed = new Set((checkpoint?.results || []).filter(hasCompletedTrace).map((result) => result.sourceSha256));
  const seen = new Set(completed);
  return inventory.filter((item) => {
    if (seen.has(item.sourceSha256)) return false;
    seen.add(item.sourceSha256);
    return true;
  });
}
