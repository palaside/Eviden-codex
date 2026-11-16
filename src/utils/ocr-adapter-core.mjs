/** A pass-through boundary: no normalization, fallback, persistence or I/O. */
export function createOcrAdapter(engine) {
  for (const method of ['extractSlipCandidates','readChatPreflight','getCachedChatEvidenceLayers']) {
    if (typeof engine[method] !== 'function') throw new TypeError(`OCR adapter missing ${method}`);
  }
  return Object.freeze({
    id: engine.id,
    extractSlipCandidates: (...args) => engine.extractSlipCandidates(...args),
    readChatPreflight: (...args) => engine.readChatPreflight(...args),
    getCachedChatEvidenceLayers: (...args) => engine.getCachedChatEvidenceLayers(...args),
  });
}

/** Future provider skeleton. Deliberately unavailable until explicitly wired. */
export function createPendingOcrAdapter(id) {
  const notConfigured = () => {
    const error = new Error(`OCR adapter ${id} is not configured; the local adapter remains the default`);
    error.code = 'OCR_ADAPTER_NOT_CONFIGURED';
    throw error;
  };
  return createOcrAdapter({
    id,
    extractSlipCandidates: async () => notConfigured(),
    readChatPreflight: async () => notConfigured(),
    getCachedChatEvidenceLayers: notConfigured,
  });
}
