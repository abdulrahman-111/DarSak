import Link from 'next/link';
import { Panel, EmptyState } from '@/components/platform/ui';
import type { Locale } from '@/features/student/domain';
import type { BookingRow, BookingSlotRow } from './domain';
import { dateTime } from '@/features/student/domain';
import {
  BookingDecisionForms,
  CancelMyBookingForm,
  CancelSlotForm,
  StudentSlotRequestForm,
} from './forms';

export const statusLabel = (status: string, locale: Locale) => {
  const labels: Record<string, [string, string]> = {
    pending: ['قيد الانتظار', 'Pending'],
    accepted: ['مؤكد', 'Confirmed'],
    declined: ['مرفوض', 'Declined'],
    withdrawn: ['مسحوب', 'Withdrawn'],
    cancelled: ['ملغى', 'Cancelled'],
    open: ['متاح', 'Available'],
  };
  const label = labels[status];
  return label ? label[locale === 'ar' ? 0 : 1] : status;
};
function DateText({
  startsAt,
  endsAt,
  locale,
}: {
  startsAt: string;
  endsAt: string;
  locale: Locale;
}) {
  return (
    <p className="mt-2 text-sm text-muted">
      {dateTime(startsAt, locale)} –{' '}
      {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }).format(new Date(endsAt))}{' '}
      · {locale === 'ar' ? 'توقيت القاهرة' : 'Cairo time'}
    </p>
  );
}
export function SlotList({
  locale,
  rows,
  empty,
  now,
  teacher = false,
}: {
  locale: Locale;
  rows: BookingSlotRow[];
  empty: string;
  now: string;
  teacher?: boolean;
}) {
  if (!rows.length)
    return (
      <Panel>
        <EmptyState>{empty}</EmptyState>
      </Panel>
    );
  return (
    <div className="grid gap-3">
      {rows.map(slot => (
        <Panel key={slot.id} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words font-bold text-teal">{slot.group_name}</h3>
              {teacher && (
                <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-bold">
                  {slot.status === 'open'
                    ? locale === 'ar'
                      ? 'منشور'
                      : 'Published'
                    : statusLabel(slot.status, locale)}
                </span>
              )}
            </div>
            {!teacher && <p className="mt-1 text-sm text-muted">{slot.teacher_name}</p>}
            <DateText startsAt={slot.starts_at} endsAt={slot.ends_at} locale={locale} />
          </div>
          <div className="grid justify-items-start gap-2">
            {teacher ? (
              slot.status === 'open' && Date.parse(slot.starts_at) > Date.parse(now) ? (
                <CancelSlotForm locale={locale} slot={slot} />
              ) : null
            ) : Date.parse(slot.starts_at) > Date.parse(now) ? (
              <StudentSlotRequestForm locale={locale} slot={slot} />
            ) : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}
export function BookingList({
  locale,
  rows,
  empty,
  now,
  allowDecision = true,
  teacher = false,
}: {
  locale: Locale;
  rows: BookingRow[];
  empty: string;
  now: string;
  allowDecision?: boolean;
  teacher?: boolean;
}) {
  if (!rows.length)
    return (
      <Panel>
        <EmptyState>{empty}</EmptyState>
      </Panel>
    );
  const ar = locale === 'ar';
  return (
    <div className="grid gap-3">
      {rows.map(booking => (
        <Panel key={booking.id} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words font-bold text-teal">{booking.group_name}</h3>
              <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-bold">
                {statusLabel(booking.status, locale)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {teacher
                ? `${ar ? 'الطالب' : 'Student'}: ${booking.student_name ?? (ar ? 'طالب' : 'Student')}`
                : `${ar ? 'المعلم' : 'Teacher'}: ${booking.teacher_name}`}
            </p>
            <DateText startsAt={booking.starts_at} endsAt={booking.ends_at} locale={locale} />
            <Link
              href={
                teacher
                  ? `/${locale}/teacher/groups/${booking.group_id}`
                  : `/${locale}/student/classes/${booking.group_id}`
              }
              className="mt-2 inline-flex font-semibold text-orange underline"
            >
              {ar ? 'عرض المجموعة' : 'View group'}
            </Link>
          </div>
          {teacher ? (
            allowDecision &&
            booking.status === 'pending' &&
            Date.parse(booking.starts_at) > Date.parse(now) ? (
              <BookingDecisionForms locale={locale} booking={booking} />
            ) : null
          ) : ['pending', 'accepted'].includes(booking.status) &&
            Date.parse(booking.starts_at) > Date.parse(now) ? (
            <CancelMyBookingForm locale={locale} booking={booking} />
          ) : null}
        </Panel>
      ))}
    </div>
  );
}
