import 'server-only';
import type { Locale } from '@/features/student/domain';

export type ServerReadOperation =
  'public_teacher_detail' | 'teacher_overview' | 'student_resources';
type ReadOutcome = 'success' | 'failed';

const SLOW_READ_MS = 2_000;
const MAX_REPORTED_DURATION_MS = 120_000;

function now() {
  try {
    return performance.now();
  } catch {
    return 0;
  }
}

function report(
  operation: ServerReadOperation,
  locale: Locale,
  outcome: ReadOutcome,
  startedAt: number,
) {
  try {
    const elapsed = now() - startedAt;
    const duration_ms = Number.isFinite(elapsed)
      ? Math.max(0, Math.min(MAX_REPORTED_DURATION_MS, Math.round(elapsed)))
      : 0;
    if (outcome === 'failed' || duration_ms >= SLOW_READ_MS) {
      console.warn('server_read', {
        operation,
        locale: locale === 'ar' ? 'ar' : 'en',
        outcome,
        duration_ms,
      });
    }
  } catch {
    // Diagnostics must not alter loader results or exceptions.
  }
}

export async function measuredServerRead<T>(
  operation: ServerReadOperation,
  locale: Locale,
  read: () => Promise<T>,
  failed?: (result: T) => boolean,
): Promise<T> {
  const startedAt = now();
  try {
    const result = await read();
    let outcome: ReadOutcome = 'success';
    try {
      if (failed?.(result)) outcome = 'failed';
    } catch {
      // A diagnostic classifier is best-effort too.
    }
    report(operation, locale === 'ar' ? 'ar' : 'en', outcome, startedAt);
    return result;
  } catch (error) {
    report(operation, locale === 'ar' ? 'ar' : 'en', 'failed', startedAt);
    throw error;
  }
}
