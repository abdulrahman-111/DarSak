import 'server-only';
import { getSupabaseConfig } from '@/lib/supabase/config';

const DEFAULT_TIMEOUT_MS = 2_500;

type HealthCheckOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** Checks only that the public PostgREST API can read one public catalogue ID. */
export async function isSupabaseHealthy({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}: HealthCheckOptions = {}): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('health_check_timeout'));
      }, timeoutMs);
    });
    const url = new URL('/rest/v1/subjects?select=id&limit=1', config.url);
    const response = await Promise.race([
      fetchImpl(url, {
        method: 'GET',
        headers: { apikey: config.key, Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      }),
      timedOut,
    ]);
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
