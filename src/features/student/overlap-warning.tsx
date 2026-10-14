import type { Locale } from './domain';
import { studentScheduleOverlap } from './overlap-data';
import { overlapMessage, scheduleOverlapCopy } from './overlap-domain';

export async function StudentOverlapWarning({ locale, groupId }: { locale: Locale; groupId: string }) {
  const result = await studentScheduleOverlap(locale, groupId).catch(() => ({ overlap: null, error: true }));
  const copy = scheduleOverlapCopy(locale);
  const message = result.error ? copy.loadError : result.overlap ? overlapMessage(locale, result.overlap) : null;
  if (!message) return null;
  return <p dir={locale === 'ar' ? 'rtl' : 'ltr'} role="status" aria-live="polite" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
    {message}
  </p>;
}
