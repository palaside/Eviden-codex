import path from "node:path";

export function isPathWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export const DUAL_STREAM_CAPTURE_KEY = "__task5DualStreamFetchCapture";
export const DUAL_STREAM_CAPTURE_MAX_BODY_BYTES = 256 * 1024 * 1024;

export function buildEvidenceEntry({ runId, type, label, capturedAt = new Date().toISOString() }) {
  const file = label.startsWith(`${runId}__`) ? label : `${runId}__${label}`;
  return { type, file, runId, capturedAt };
}

export function finalizeTask5ReportStatus(report) {
  if (report.status === "ERROR" || report.status === "BLOCKED") return report.status;
  const sourcePreserved = report.sourceUnchanged === true
    && report.sourcePreservation?.status === "checked"
    && report.sourcePreservation.unchanged === true;
  const cleanupComplete = report.cleanup?.tracingStopped === true
    && report.cleanup.browserClosed === true
    && (!report.ownedResources?.devServer || report.cleanup.ownedDevServerStopped === true);
  const checksPass = Object.values(report.checks ?? {}).every(Boolean);
  return checksPass
    && report.detectionPass === true
    && report.workflowCompleted === true
    && report.finalCanvasState?.status === "captured"
    && sourcePreserved
    && cleanupComplete
    ? "PASS"
    : "FAIL";
}

export async function installDualStreamFetchCapture(page, {
  runId,
  maxBodyBytes = DUAL_STREAM_CAPTURE_MAX_BODY_BYTES,
  captureKey = DUAL_STREAM_CAPTURE_KEY,
} = {}) {
  await page.addInitScript(({ runId, maxBodyBytes, captureKey }) => {
    const targetPath = "/api/research/dual-stream";
    const capture = {
      version: 1,
      runId: runId ?? null,
      target: { method: "POST", path: targetPath },
      maxBodyBytes,
      state: "idle",
      matchedRequestCount: 0,
      bodyReadCount: 0,
      status: null,
      statusText: null,
      headers: {},
      body: null,
      bodyLength: 0,
      truncated: false,
      capturedAt: null,
      error: null,
    };
    window[captureKey] = capture;
    const originalFetch = window.fetch;

    const readClone = async (response) => {
      const clone = response.clone();
      const reader = clone.body?.getReader();
      if (!reader) throw new Error("target response has no readable body");
      const chunks = [];
      let bodyLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bodyLength += value.byteLength;
        if (bodyLength > maxBodyBytes) {
          await reader.cancel();
          return { state: "too_large", body: null, bodyLength, truncated: true };
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(bodyLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return {
        state: "captured",
        body: new TextDecoder().decode(bytes),
        bodyLength,
        truncated: false,
      };
    };

    const captureResponse = async (response) => {
      capture.status = response.status;
      capture.statusText = response.statusText;
      capture.headers = Object.fromEntries(response.headers.entries());
      capture.bodyReadCount = 1;
      try {
        Object.assign(capture, await readClone(response));
      } catch (error) {
        capture.state = "error";
        capture.error = String(error?.stack || error);
      }
      capture.capturedAt = new Date().toISOString();
    };

    window.fetch = function task5Fetch(input, init) {
      let url;
      let method;
      try {
        const request = input instanceof Request ? input : null;
        url = new URL(typeof input === "string" ? input : request?.url || String(input), location.href);
        method = String(init?.method || request?.method || "GET").toUpperCase();
      } catch {
        return originalFetch.apply(this, arguments);
      }
      if (url.pathname !== targetPath || method !== "POST" || capture.state !== "idle") {
        return originalFetch.apply(this, arguments);
      }
      capture.state = "pending";
      capture.matchedRequestCount = 1;
      return originalFetch.apply(this, arguments).then((response) => {
        void captureResponse(response);
        return response;
      }).catch((error) => {
        capture.state = "error";
        capture.error = String(error?.stack || error);
        capture.capturedAt = new Date().toISOString();
        throw error;
      });
    };
  }, { runId, maxBodyBytes, captureKey });
}

export async function readDualStreamFetchCapture(page, {
  timeoutMs,
  captureKey = DUAL_STREAM_CAPTURE_KEY,
} = {}) {
  return page.evaluate(async ({ captureKey, timeoutMs }) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const capture = window[captureKey];
      if (capture && capture.state !== "idle" && capture.state !== "pending") return capture;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`page-context capture timed out after ${timeoutMs}ms`);
  }, { captureKey, timeoutMs });
}

export function buildArtifactManifest({
  runId,
  startedAt,
  capturedAt,
  sourceSha256,
  artifacts,
  artifactValidation,
}) {
  return {
    schema: "digital-evidence.dual-stream.artifact-manifest.v1",
    runId,
    startedAt,
    capturedAt,
    sourceSha256,
    artifacts: artifactValidation.map((validation, index) => ({
      ...validation,
      artifactPath: artifacts[index]?.artifactPath ?? null,
    })),
  };
}
