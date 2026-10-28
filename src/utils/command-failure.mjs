export function formatCommandFailure({ code, signal, timedOut, timeoutMs, stderr, stdout }) {
  const output = stderr.slice(-2_000) || stdout.slice(-2_000);
  if (timedOut) return `Command timed out after ${timeoutMs} ms${output ? `: ${output}` : ""}`;
  const exit = code === null ? `signal ${signal || "unknown"}` : code;
  return `Command failed (${exit}): ${output}`;
}
