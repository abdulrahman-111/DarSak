import { describe, expect, it } from 'vitest';
import {
  bookingIdSchema,
  normalizeBookingPage,
  parseBookingPage,
  parseBookingSlots,
} from '@/features/bookings/domain';
import { cairoDateTimeToUtc } from '@/lib/domain';
import {
  notificationHref,
  notificationSummary,
  parseNotificationsPage,
} from '@/features/notifications/domain';

const uuid = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';

describe('booking domain', () => {
  it('validates IDs and normalizes bounded pagination', () => {
    expect(bookingIdSchema.safeParse(uuid).success).toBe(true);
    expect(bookingIdSchema.safeParse('not-an-id').success).toBe(false);
    expect(normalizeBookingPage('0')).toBe(1);
    expect(normalizeBookingPage('999999')).toBe(1);
    expect(normalizeBookingPage('2')).toBe(2);
  });

  it('accepts bounded, known booking page rows and rejects malformed payloads', () => {
    const row = {
      id: uuid,
      slot_id: uuid,
      group_id: uuid,
      group_name: 'Algebra',
      teacher_name: 'Teacher',
      student_name: 'Student',
      starts_at: '2026-10-22T10:00:00Z',
      ends_at: '2026-10-22T11:00:00Z',
      status: 'pending',
    };
    expect(parseBookingPage({ rows: [row], total: 1 })).toMatchObject({ rows: [{ id: uuid }] });
    const studentRpcRow = { ...row, student_name: null };
    const parsedStudentPage = parseBookingPage({ rows: [studentRpcRow], total: 1 });
    expect(parsedStudentPage?.rows[0]).toMatchObject({ id: uuid, status: 'pending' });
    expect(parsedStudentPage?.rows[0]).not.toHaveProperty('student_name');
    const proposal = parseBookingPage({
      rows: [{ ...studentRpcRow, source: 'student_proposed' }],
      total: 1,
    });
    expect(proposal?.rows[0]).toMatchObject({
      source: 'student_proposed',
      status: 'pending',
    });
    expect(parseBookingPage({ rows: [{ ...row, source: 'unexpected' }], total: 1 })).toBeNull();
    expect(
      parseBookingPage({ rows: [{ ...row, id: 'javascript:alert(1)' }], total: 1 }),
    ).toBeNull();
    expect(parseBookingPage({ rows: Array(21).fill(row), total: 21 })).toBeNull();
    expect(parseBookingPage({ rows: [row], total: -1 })).toBeNull();
  });

  it('parses open slot rows and builds role-specific safe notification links', () => {
    expect(
      parseBookingSlots({
        rows: [
          {
            id: uuid,
            group_id: uuid,
            group_name: 'Algebra',
            teacher_name: 'Teacher',
            starts_at: '2026-10-22T10:00:00Z',
            ends_at: '2026-10-22T11:00:00Z',
            status: 'open',
          },
        ],
        total: 1,
      })?.rows,
    ).toHaveLength(1);
    expect(notificationHref('student', 'booking_updated', {}, 'en')).toBe('/en/student/bookings');
    expect(notificationHref('teacher', 'booking_updated', {}, 'ar')).toBe('/ar/teacher/bookings');
    expect(notificationHref('admin', 'booking_updated', {}, 'en')).toBeNull();
    expect(
      notificationSummary('booking_updated', { status: 'accepted', group_name: 'Algebra' }, 'en'),
    ).toContain('accepted');
    expect(
      parseNotificationsPage({
        rows: [
          {
            id: uuid,
            kind: 'booking_updated',
            payload: { status: 'accepted', group_name: 'Algebra' },
            created_at: '2026-10-14T12:00:00Z',
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      })?.rows[0].kind,
    ).toBe('booking_updated');
  });

  it('converts clear Cairo wall times and rejects DST gaps and ambiguous hours', () => {
    expect(cairoDateTimeToUtc('2026-01-15T12:30')).toBe('2026-01-15T10:30:00.000Z');
    expect(() => cairoDateTimeToUtc('2026-04-24T00:30')).toThrow(/missing or ambiguous/i);
    expect(() => cairoDateTimeToUtc('2026-10-29T23:30')).toThrow(/missing or ambiguous/i);
  });
});
