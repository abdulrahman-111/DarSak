import { NextRequest } from 'next/server';
import { flushEmailOutbox } from '@/features/email/worker';
import { validCronAuthorization } from './auth';
import { isExternalWorkerEnabled } from '@/lib/deployment-environment';

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
    return Response.json({ state: 'disabled' }, { status: 200, headers });
  }
  if (!validCronAuthorization(request.headers.get('authorization'), cronSecret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  if (staging) return Response.json({ state: 'disabled' }, { status: 200, headers });
  try {
    const counts = await flushEmailOutbox(5);
    return Response.json(counts, { status: counts.state === 'error' ? 503 : 200, headers });
  } catch {
    return Response.json(
      { state: 'error', claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, unsettled: 0 },
      { status: 503, headers },
    );
  }
}
