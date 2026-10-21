import 'server-only';
import type { Locale } from '@/features/student/domain';
import { student } from '@/features/student/data';
import { teacherIdentity } from '@/features/teacher/data';
import {
  BOOKING_PAGE_SIZE,
  bookingPageCount,
  normalizeBookingPage,
  parseBookingPage,
  parseBookingSlots,
} from './domain';

const clampPage = (page: number, total: number) => Math.min(page, bookingPageCount(total));

export async function teacherBookingData(
  locale: Locale,
  requestPageInput: unknown,
  slotPageInput: unknown,
) {
  const me = await teacherIdentity(locale);
  const requestPage = normalizeBookingPage(requestPageInput);
  const slotPage = normalizeBookingPage(slotPageInput);
  const [requestsResult, slotsResult, groupsResult] = await Promise.all([
    me.db.rpc('booking_page', {
      p_scope: 'teacher',
      p_offset: (requestPage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    }),
    me.db.rpc('teacher_booking_slots', {
      p_offset: (slotPage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    }),
    me.db
      .from('groups')
      .select('id,name,status')
      .eq('teacher_id', me.id)
      .eq('status', 'published')
      .order('name')
      .order('id')
      .limit(100),
  ]);
  let requests = requestsResult.error ? null : parseBookingPage(requestsResult.data);
  let slots = slotsResult.error ? null : parseBookingSlots(slotsResult.data);
  let actualRequestPage = requests ? clampPage(requestPage, requests.total) : 1;
  let actualSlotPage = slots ? clampPage(slotPage, slots.total) : 1;
  if (requests && actualRequestPage !== requestPage) {
    const retry = await me.db.rpc('booking_page', {
      p_scope: 'teacher',
      p_offset: (actualRequestPage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    });
    requests = retry.error ? null : parseBookingPage(retry.data);
  }
  if (slots && actualSlotPage !== slotPage) {
    const retry = await me.db.rpc('teacher_booking_slots', {
      p_offset: (actualSlotPage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    });
    slots = retry.error ? null : parseBookingSlots(retry.data);
  }
  const groups =
    groupsResult.error || !Array.isArray(groupsResult.data)
      ? null
      : groupsResult.data
          .filter(
            (row): row is { id: string; name: string; status: string } =>
              !!row &&
              typeof row === 'object' &&
              typeof row.id === 'string' &&
              typeof row.name === 'string' &&
              row.status === 'published',
          )
          .slice(0, 100);
  return {
    requests: requests?.rows ?? [],
    requestTotal: requests?.total ?? 0,
    requestPage: actualRequestPage,
    requestPageCount: bookingPageCount(requests?.total ?? 0),
    slots: slots?.rows ?? [],
    slotTotal: slots?.total ?? 0,
    slotPage: actualSlotPage,
    slotPageCount: bookingPageCount(slots?.total ?? 0),
    groups: groups ?? [],
    error: !requests || !slots || !groups,
  };
}

export async function studentBookingData(
  locale: Locale,
  requestPageInput: unknown,
  availablePageInput: unknown,
) {
  const me = await student(locale);
  const requestPage = normalizeBookingPage(requestPageInput);
  const availablePage = normalizeBookingPage(availablePageInput);
  const [requestsResult, slotsResult] = await Promise.all([
    me.db.rpc('booking_page', {
      p_scope: 'student',
      p_offset: (requestPage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    }),
    me.db.rpc('student_available_booking_slots', {
      p_offset: (availablePage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    }),
  ]);
  let requests = requestsResult.error ? null : parseBookingPage(requestsResult.data);
  let slots = slotsResult.error ? null : parseBookingSlots(slotsResult.data);
  let actualRequestPage = requests ? clampPage(requestPage, requests.total) : 1;
  let actualAvailablePage = slots ? clampPage(availablePage, slots.total) : 1;
  if (requests && actualRequestPage !== requestPage) {
    const retry = await me.db.rpc('booking_page', {
      p_scope: 'student',
      p_offset: (actualRequestPage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    });
    requests = retry.error ? null : parseBookingPage(retry.data);
  }
  if (slots && actualAvailablePage !== availablePage) {
    const retry = await me.db.rpc('student_available_booking_slots', {
      p_offset: (actualAvailablePage - 1) * BOOKING_PAGE_SIZE,
      p_limit: BOOKING_PAGE_SIZE,
    });
    slots = retry.error ? null : parseBookingSlots(retry.data);
  }
  return {
    requests: requests?.rows ?? [],
    requestTotal: requests?.total ?? 0,
    requestPage: actualRequestPage,
    requestPageCount: bookingPageCount(requests?.total ?? 0),
    slots: slots?.rows ?? [],
    availableTotal: slots?.total ?? 0,
    availablePage: actualAvailablePage,
    availablePageCount: bookingPageCount(slots?.total ?? 0),
    error: !requests || !slots,
  };
}
