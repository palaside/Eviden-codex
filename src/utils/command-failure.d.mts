export function formatCommandFailure(result: {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  timeoutMs: number;
  stderr: string;
  stdout: string;
}): string;
