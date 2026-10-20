import 'server-only';

import { randomUUID } from 'node:crypto';

const SAFE_CODE = /^[A-Z0-9]{2,12}$/;

export function logActionFailure(
  operation: string,
  startedAt: number,
  error?: unknown,
  fallback = 'FAILURE',
) {
  const rawCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const code = typeof rawCode === 'string' && SAFE_CODE.test(rawCode) ? rawCode : fallback;
  console.warn(
    JSON.stringify({
      event: 'server_action_failure',
      operation,
      code,
      durationMs: Math.max(0, Date.now() - startedAt),
      correlationId: randomUUID(),
    }),
  );
}
