import 'server-only';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeOperationEvent, type Operation } from './domain';
/** Only categorical counters leave the operation. Never accept arbitrary metadata. */
export async function observeOperation<T extends { error?: { code?: string } | null }>(
  operation: Operation,
  locale: string,
  run: () => PromiseLike<T>,
): Promise<T> {
  const started = performance.now();
  const record = (error?: { code?: string } | null) => {
    const event = safeOperationEvent(operation, locale, performance.now() - started, error);
    if (event.outcome === 'failed' || event.duration_ms >= 2000)
      console.warn('darsak_operation', event);
    try {
      after(async () => {
        try {
          const db = createAdminClient();
          const r = await db.rpc('record_launch_operation', {
            p_operation: event.operation,
            p_outcome: event.outcome,
            p_category: event.category,
            p_duration_ms: event.duration_ms,
          });
          if (r.error) console.warn('darsak_monitoring_unavailable');
        } catch {
          console.warn('darsak_monitoring_unavailable');
        }
      });
    } catch {
      /* Diagnostics never block an account operation. */
    }
  };
  try {
    const result = await run();
    record(result.error);
    return result;
  } catch (error) {
    record({ code: 'provider' });
    throw error;
  }
}
