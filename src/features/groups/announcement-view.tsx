import type { Locale } from '@/features/student/domain';
import type { GroupAnnouncement } from './announcement-data';

export function AnnouncementView({ locale, announcement, className = '' }: { locale: Locale; announcement: GroupAnnouncement | null; className?: string }) {
  if (!announcement?.body) return null;
  const ar = locale === 'ar';
  const edited = new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(announcement.edited_at));
  return <section dir={ar ? 'rtl' : 'ltr'} className={`rounded-2xl border border-line bg-white p-4 sm:p-5 ${className}`}>
    <h2 className="text-lg font-black text-teal">{ar ? 'إعلان المجموعة' : 'Group announcement'}</h2>
    <p className="mt-1 text-xs text-muted">{ar ? `آخر تعديل: ${edited}` : `Edited ${edited}`}</p>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink">{announcement.body}</p>
  </section>;
}
