import { NextRequest } from 'next/server';
import { validCronAuthorization } from '@/app/api/email/cron/auth';
import { assertStagingBackend, isExternalWorkerEnabled } from '@/lib/deployment-environment';

export const runtime = 'nodejs';
export const maxDuration = 40;
const headers = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};

export async function GET(request: NextRequest) {
  const staging = !isExternalWorkerEnabled();
  const cronSecret = process.env.CRON_SECRET;
  if (staging && !cronSecret) {
    return Response.json(
      { state: 'disabled', claimed: 0, completed: 0, pending: 0 },
      { status: 200, headers },
    );
  }
  if (!validCronAuthorization(request.headers.get('authorization'), cronSecret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  if (staging) {
    return Response.json(
      { state: 'disabled', claimed: 0, completed: 0, pending: 0 },
      { status: 200, headers },
    );
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const workerSecret = process.env.ACCOUNT_DELETION_WORKER_SECRET;
  if (!supabaseUrl || !publishableKey || !workerSecret) {
    return Response.json(
      { state: 'error', claimed: 0, completed: 0, pending: 0 },
      { status: 503, headers },
    );
  }
  try {
    assertStagingBackend(supabaseUrl);
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: publishableKey,
        'x-account-deletion-worker-key': workerSecret,
      },
      body: JSON.stringify({ operation: 'worker', limit: 5 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return Response.json(
        { state: 'error', claimed: 0, completed: 0, pending: 0 },
        { status: 503, headers },
      );
    }
    const value = result as Record<string, unknown>;
    const safe = {
      state: typeof value.state === 'string' ? value.state : 'error',
      claimed: Number.isInteger(value.claimed) ? value.claimed : 0,
      completed: Number.isInteger(value.completed) ? value.completed : 0,
      pending: Number.isInteger(value.pending) ? value.pending : 0,
    };
    return Response.json(safe, { status: response.ok ? 200 : 503, headers });
  } catch {
    return Response.json(
      { state: 'error', claimed: 0, completed: 0, pending: 0 },
      { status: 503, headers },
    );
  }
}
