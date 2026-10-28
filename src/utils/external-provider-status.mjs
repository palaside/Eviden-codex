const RETRYABLE_PROVIDER_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function classifyExternalProviderStatus(status) {
  return {
    provider_status: status,
    retryable: RETRYABLE_PROVIDER_STATUSES.has(status),
  };
}
