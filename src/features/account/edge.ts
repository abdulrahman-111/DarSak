import 'server-only';
import { requireSupabaseConfig } from '@/lib/supabase/config';
import { assertStagingBackend } from '@/lib/deployment-environment';

export type DeletionStatus = {
  state: 'available' | 'pending' | 'completed' | 'unavailable';
  role: string | null;
  request_id: string | null;
  request_state: string | null;
};
export type EdgeResult<T> = { data: T | null; error: string | null };

export async function callDeletionEdge<T>(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<EdgeResult<T>> {
  const { url, key } = requireSupabaseConfig();
  assertStagingBackend(url);
  try {
    const response = await fetch(`${url}/functions/v1/delete-account`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      ({ message?: unknown; error?: unknown } & Record<string, unknown>) | null;
    if (!response.ok)
      return {
        data: payload as T | null,
        error: typeof payload?.error === 'string' ? payload.error : 'unavailable',
      };
    return { data: payload as T, error: null };
  } catch {
    return { data: null, error: 'unavailable' };
  }
}
