'use server';

import { revalidatePath } from 'next/cache';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { requireTeachingAccess } from '@/components/platform/access';
import { teacherViewer } from '@/features/teacher/data';
import { idSchema, type Locale } from '@/features/student/domain';
import { cairoDateTimeToUtc } from '@/lib/domain';

export type BookingActionState = { error?: string; success?: string } | null;
const copy = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);
const fail = (locale: Locale) => ({
  error: copy(
    locale,
    'Could not save this booking change. Refresh and try again.',
    'تعذر حفظ التغيير. حدّث الصفحة وحاول مرة أخرى.',
  ),
});

async function verifiedStudent(locale: Locale) {
  const { db, user, profile } = await getRequestViewer();
  if (!user || !profile || profile.status !== 'active' || profile.role !== 'student') return null;
  return { db, id: user.id };
}
function refresh() {
  for (const locale of ['en', 'ar'] as const) {
    revalidatePath(`/${locale}/teacher/bookings`);
    revalidatePath(`/${locale}/student/bookings`);
    revalidatePath(`/${locale}/teacher`);
    revalidatePath(`/${locale}/student`);
    revalidatePath(`/${locale}/teacher`, 'layout');
    revalidatePath(`/${locale}/student`, 'layout');
    revalidatePath(`/${locale}/notifications`);
  }
}

export async function publishBookingSlot(
  locale: Locale,
  _state: BookingActionState,
  form: FormData,
): Promise<BookingActionState> {
  if (locale !== 'en' && locale !== 'ar') return fail('en');
  const groupId = String(form.get('group_id') ?? '');
  const startsLocal = String(form.get('starts_local') ?? '');
  const endsLocal = String(form.get('ends_local') ?? '');
  if (!idSchema.safeParse(groupId).success)
    return {
      error: copy(locale, 'Choose a published group you own.', 'اختر مجموعة منشورة تملكها.'),
    };
  let startsAt: string, endsAt: string;
  try {
    startsAt = cairoDateTimeToUtc(startsLocal);
    endsAt = cairoDateTimeToUtc(endsLocal);
  } catch {
    return {
      error: copy(
        locale,
        'Choose a clear Cairo date and time.',
        'اختر تاريخًا ووقتًا واضحين بتوقيت القاهرة.',
      ),
    };
  }
  const duration = Date.parse(endsAt) - Date.parse(startsAt);
  if (
    startsAt <= new Date().toISOString() ||
    duration <= 0 ||
    duration > 4 * 60 * 60 * 1000 ||
    Date.parse(startsAt) > Date.now() + 365 * 86400000
  )
    return {
      error: copy(
        locale,
        'Choose a future time within the next year, lasting up to 4 hours.',
        'اختر موعدًا قادمًا خلال السنة القادمة ومدته حتى ٤ ساعات.',
      ),
    };
  let me;
  try {
    me = await requireTeachingAccess(locale);
  } catch {
    return fail(locale);
  }
  const { error } = await me.db.rpc('publish_booking_slot', {
    p_group_id: groupId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) return fail(locale);
  refresh();
  return { success: copy(locale, 'One-off time published.', 'تم نشر الموعد الفردي.') };
}

export async function cancelBookingSlot(
  locale: Locale,
  slotId: string,
  _state: BookingActionState,
  _form: FormData,
): Promise<BookingActionState> {
  if ((locale !== 'en' && locale !== 'ar') || !idSchema.safeParse(slotId).success)
    return fail('en');
  let me;
  try {
    me = await teacherViewer(locale);
  } catch {
    return fail(locale);
  }
  if (me.teacherError || !me.teacher?.approved) return fail(locale);
  const { error } = await me.db.rpc('cancel_booking_slot', { p_slot_id: slotId });
  if (error) return fail(locale);
  refresh();
  return { success: copy(locale, 'One-off time cancelled.', 'تم إلغاء الموعد الفردي.') };
}

export async function requestBooking(
  locale: Locale,
  slotId: string,
  _state: BookingActionState,
  _form: FormData,
): Promise<BookingActionState> {
  if ((locale !== 'en' && locale !== 'ar') || !idSchema.safeParse(slotId).success)
    return fail('en');
  const me = await verifiedStudent(locale);
  if (!me) return fail(locale);
  const { error } = await me.db.rpc('request_booking', { p_slot_id: slotId });
  if (error) return fail(locale);
  refresh();
  return {
    success: copy(
      locale,
      'Booking request sent to the teacher.',
      'تم إرسال طلب الموعد إلى المعلم.',
    ),
  };
}

export async function decideBooking(
  locale: Locale,
  requestId: string,
  accept: boolean,
  _state: BookingActionState,
  _form: FormData,
): Promise<BookingActionState> {
  if (
    (locale !== 'en' && locale !== 'ar') ||
    !idSchema.safeParse(requestId).success ||
    typeof accept !== 'boolean'
  )
    return fail('en');
  let me;
  try {
    me = await requireTeachingAccess(locale);
  } catch {
    return fail(locale);
  }
  const { error } = await me.db.rpc('decide_booking', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) return fail(locale);
  refresh();
  return {
    success: copy(
      locale,
      accept ? 'Booking request accepted.' : 'Booking request declined.',
      accept ? 'تم قبول طلب الموعد.' : 'تم رفض طلب الموعد.',
    ),
  };
}

export async function cancelMyBooking(
  locale: Locale,
  requestId: string,
  _state: BookingActionState,
  _form: FormData,
): Promise<BookingActionState> {
  if ((locale !== 'en' && locale !== 'ar') || !idSchema.safeParse(requestId).success)
    return fail('en');
  const me = await verifiedStudent(locale);
  if (!me) return fail(locale);
  const { error } = await me.db.rpc('cancel_my_booking', { p_request_id: requestId });
  if (error) return fail(locale);
  refresh();
  return { success: copy(locale, 'Booking request cancelled.', 'تم إلغاء طلب الموعد.') };
}
