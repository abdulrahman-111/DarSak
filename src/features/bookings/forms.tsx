'use client';

import { useActionState } from 'react';
import type { BookingRow, BookingSlotRow } from './domain';
import type { Locale } from '@/features/student/domain';
import {
  cancelBookingSlot,
  cancelMyBooking,
  decideBooking,
  publishBookingSlot,
  proposeBookingTime,
  requestBooking,
  type BookingActionState,
} from './actions';

function Result({ state }: { state: BookingActionState }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  ) : state?.success ? (
    <p role="status" className="text-sm text-teal">
      {state.success}
    </p>
  ) : null;
}
const button =
  'min-h-11 rounded-xl border border-teal/25 px-3 py-2 text-sm font-bold text-teal disabled:opacity-50';

export function PublishBookingSlotForm({
  locale,
  groups,
}: {
  locale: Locale;
  groups: { id: string; name: string }[];
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(publishBookingSlot.bind(null, locale), null);
  return (
    <form action={action} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <label className="grid min-w-0 gap-1 text-sm font-semibold">
        {ar ? 'المجموعة المنشورة' : 'Published group'}
        <select
          name="group_id"
          required
          defaultValue=""
          className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3"
        >
          <option value="" disabled>
            {ar ? 'اختر مجموعة' : 'Choose a group'}
          </option>
          {groups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-semibold">
        {ar ? 'يبدأ بتوقيت القاهرة' : 'Starts (Cairo time)'}
        <input
          required
          type="datetime-local"
          name="starts_local"
          className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3"
        />
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-semibold">
        {ar ? 'ينتهي بتوقيت القاهرة' : 'Ends (Cairo time)'}
        <input
          required
          type="datetime-local"
          name="ends_local"
          className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          disabled={pending || !groups.length}
          className="min-h-11 rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {pending ? '…' : ar ? 'نشر الموعد' : 'Publish time'}
        </button>
        <Result state={state} />
        {!groups.length && (
          <p className="text-sm text-muted">
            {ar ? 'لا توجد مجموعات منشورة متاحة.' : 'No published groups are available.'}
          </p>
        )}
      </div>
    </form>
  );
}

export function CancelSlotForm({ locale, slot }: { locale: Locale; slot: BookingSlotRow }) {
  const [state, action, pending] = useActionState(
    cancelBookingSlot.bind(null, locale, slot.id),
    null,
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <button disabled={pending} className={button}>
        {pending ? '…' : locale === 'ar' ? 'إلغاء الوقت' : 'Cancel time'}
      </button>
      <Result state={state} />
    </form>
  );
}

export function StudentSlotRequestForm({ locale, slot }: { locale: Locale; slot: BookingSlotRow }) {
  const [state, action, pending] = useActionState(requestBooking.bind(null, locale, slot.id), null);
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <button
        disabled={pending}
        className="min-h-11 rounded-xl bg-orange px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        {pending ? '…' : locale === 'ar' ? 'طلب الموعد' : 'Request time'}
      </button>
      <Result state={state} />
    </form>
  );
}

export function StudentBookingProposalForm({
  locale,
  groups,
  query,
}: {
  locale: Locale;
  groups: { id: string; name: string; teacher_name: string }[];
  query: string;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(proposeBookingTime.bind(null, locale), null);
  return (
    <div className="grid gap-3">
      <form method="get" className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid min-w-0 gap-1 text-sm font-semibold">
          {ar ? 'ابحث في مجموعاتك المقبولة' : 'Search your accepted groups'}
          <input
            type="search"
            name="proposal_group_q"
            defaultValue={query}
            maxLength={80}
            className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3"
          />
        </label>
        <button className="min-h-11 self-end rounded-xl border border-teal/25 px-4 py-2 font-bold text-teal">
          {ar ? 'بحث' : 'Search'}
        </button>
      </form>
      <form
        action={action}
        className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      >
        <label className="grid min-w-0 gap-1 text-sm font-semibold sm:col-span-2">
          {ar ? 'المجموعة' : 'Group'}
          <select
            name="group_id"
            required
            defaultValue=""
            className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3"
          >
            <option value="" disabled>
              {ar ? 'اختر مجموعة مقبولة' : 'Choose an accepted group'}
            </option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name} · {group.teacher_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-semibold">
          {ar ? 'يبدأ بتوقيت القاهرة' : 'Starts (Cairo time)'}
          <input
            required
            type="datetime-local"
            name="starts_local"
            className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-semibold">
          {ar ? 'ينتهي بتوقيت القاهرة' : 'Ends (Cairo time)'}
          <input
            required
            type="datetime-local"
            name="ends_local"
            className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3"
          />
        </label>
        <p className="text-sm text-muted sm:col-span-2">
          {ar
            ? 'هذا اقتراح خاص للمعلم. لن يحجز الوقت قبل قبول المعلم، ولن يضيف حصة إلى جدول المجموعة.'
            : 'This is a private suggestion to the teacher. It does not reserve the time unless accepted, and it will not add a regular group lesson.'}
        </p>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            disabled={pending || !groups.length}
            className="min-h-11 rounded-xl bg-orange px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {pending ? '…' : ar ? 'اقتراح الموعد' : 'Propose time'}
          </button>
          <Result state={state} />
          {!groups.length && (
            <p className="text-sm text-muted">
              {ar ? 'لا توجد مجموعات مقبولة مطابقة.' : 'No matching accepted groups.'}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

export function BookingDecisionForms({ locale, booking }: { locale: Locale; booking: BookingRow }) {
  const ar = locale === 'ar';
  const [acceptState, accept, accepting] = useActionState(
    decideBooking.bind(null, locale, booking.id, true),
    null,
  );
  const [declineState, decline, declining] = useActionState(
    decideBooking.bind(null, locale, booking.id, false),
    null,
  );
  return (
    <div className="flex flex-wrap gap-2">
      <form action={accept}>
        <button
          disabled={accepting}
          className="min-h-11 rounded-xl bg-teal px-3 py-2 text-sm font-bold text-white"
        >
          {ar ? 'قبول' : 'Accept'}
        </button>
        <Result state={acceptState} />
      </form>
      <form action={decline}>
        <button disabled={declining} className={button}>
          {ar ? 'رفض' : 'Decline'}
        </button>
        <Result state={declineState} />
      </form>
    </div>
  );
}

export function CancelMyBookingForm({ locale, booking }: { locale: Locale; booking: BookingRow }) {
  const [state, action, pending] = useActionState(
    cancelMyBooking.bind(null, locale, booking.id),
    null,
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <button disabled={pending} className={button}>
        {pending
          ? '…'
          : locale === 'ar'
            ? booking.status === 'accepted'
              ? 'إلغاء الموعد'
              : 'إلغاء الطلب'
            : booking.status === 'accepted'
              ? 'Cancel booking'
              : 'Cancel request'}
      </button>
      <Result state={state} />
    </form>
  );
}
