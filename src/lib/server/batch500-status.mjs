export function summarizeBatchCheckpoint(checkpoint, now = Date.now()) {
  const results = Array.isArray(checkpoint?.results) ? checkpoint.results : [];
  const terminal = new Set(["completed", "review_required", "failed", "skipped_duplicate"]);
  const count = (status) => results.filter((result) => result.status === status).length;
  const updatedAt = typeof checkpoint?.updatedAt === "string" ? checkpoint.updatedAt : null;
  const updatedMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const stale = !Number.isFinite(updatedMs) || now - updatedMs > 10 * 60 * 1000;
  const hasRunningBatch = Object.values(checkpoint?.batchStates || {}).some((batch) => batch?.status === "running");
  const state = hasRunningBatch && !stale ? "running" : hasRunningBatch ? "stalled" : checkpoint?.stopReason ? "stopped" : "idle";
  return {
    state,
    updatedAt,
    buildId: checkpoint?.buildId || null,
    total: results.length,
    terminal: results.filter((result) => terminal.has(result.status)).length,
    pending: results.filter((result) => !terminal.has(result.status)).length,
    reviewRequired: count("review_required"),
    failed: count("failed"),
    skippedDuplicate: count("skipped_duplicate"),
    stopReason: checkpoint?.stopReason || null,
  };
}
