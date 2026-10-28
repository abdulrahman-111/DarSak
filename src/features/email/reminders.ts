import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Queues due lesson reminders. Runs inside the email cron before the outbox is drained.
 * The database function is idempotent (event_key) and only considers lessons that are
 * still scheduled, so repeated or late runs never duplicate or send stale reminders.
 * Returns the number of newly queued reminders, or null when the step failed (callers
 * must still drain the outbox).
 */
export async function enqueueLessonReminders(): Promise<number | null> {
  try {
    const { data, error } = await createAdminClient().rpc('enqueue_lesson_reminders');
    return !error && Number.isSafeInteger(data) && (data as number) >= 0 ? (data as number) : null;
  } catch {
    return null;
  }
}
