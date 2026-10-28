import { NextRequest } from 'next/server';
import { enqueueLessonReminders } from '@/features/email/reminders';
import { flushEmailOutbox, MAX_EMAIL_JOBS_PER_RUN } from '@/features/email/worker';
import { validCronAuthorization } from './auth';

export const runtime = 'nodejs';
export const maxDuration = 40;
const headers = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};

export async function GET(request: NextRequest) {
  if (!validCronAuthorization(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  try {
    // Queue due lesson reminders first; a failure here must not stop the outbox from draining.
    const reminders = await enqueueLessonReminders();
    // Claims one job at a time until the outbox is empty or the worker's time budget is spent.
    const counts = await flushEmailOutbox(MAX_EMAIL_JOBS_PER_RUN);
    // A production deployment without mail configuration must not look healthy to cron monitoring.
    const misconfigured =
      counts.state === 'not_configured' && process.env.VERCEL_ENV === 'production';
    const status = counts.state === 'error' || misconfigured ? 503 : 200;
    return Response.json({ ...counts, reminders_enqueued: reminders }, { status, headers });
  } catch {
    return Response.json(
      { state: 'error', claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, unsettled: 0 },
      { status: 503, headers },
    );
  }
}
