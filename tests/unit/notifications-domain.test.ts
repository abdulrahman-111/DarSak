import { describe, expect, it } from 'vitest';
import {
  notificationHref,
  notificationSummary,
  parseNotificationsPage,
} from '@/features/notifications/domain';

const uuid = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';

describe('notifications domain', () => {
  it('bounds pages and exposes only notification row fields', () => {
    expect(
      parseNotificationsPage({
        rows: [
          {
            id: uuid,
            kind: 'lesson_rescheduled',
            payload: { title: '<b>Math</b>' },
            created_at: '2026-10-14T12:00:00Z',
            read_at: null,
            recipient_id: uuid,
          },
        ],
        total: 21,
        unread: 1,
      }),
    ).toMatchObject({
      rows: [
        { id: uuid, kind: 'lesson_rescheduled', payload: { title: '<b>Math</b>' }, read_at: null },
      ],
      total: 21,
      unread: 1,
    });
    expect(parseNotificationsPage({ rows: [], total: -1, unread: 0 })).toBeNull();
    expect(
      parseNotificationsPage({
        rows: [
          {
            id: uuid,
            kind: 'enrollment_accepted',
            payload: { group_id: uuid, group_name: 'Algebra group' },
            created_at: '2026-10-14T12:00:00Z',
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      })?.rows[0].kind,
    ).toBe('enrollment_accepted');
  });

  it('uses role and valid source ids to build notification links', () => {
    expect(notificationHref('student', 'lesson_rescheduled', { lesson_id: uuid }, 'en')).toBe(
      `/en/student/lessons/${uuid}`,
    );
    expect(notificationHref('admin', 'teacher_review_requested', { teacher_id: uuid }, 'ar')).toBe(
      `/ar/admin/teachers/${uuid}`,
    );
    expect(notificationHref('teacher', 'enrollment_requested', { group_id: uuid }, 'en')).toBe(
      `/en/teacher/requests?group_id=${uuid}`,
    );
    expect(
      notificationHref('student', 'lesson_rescheduled', { lesson_id: 'javascript:alert(1)' }, 'en'),
    ).toBeNull();
    expect(notificationHref('teacher', 'teacher_review_decision', {}, 'ar')).toBe(
      '/ar/account/application',
    );
    expect(notificationHref('teacher', 'teacher_fee_announcement', {}, 'ar')).toBe(
      '/ar/account/teaching-access',
    );
    expect(notificationHref('student', 'enrollment_accepted', { group_id: uuid }, 'en')).toBe(
      `/en/student/classes/${uuid}?view=teacher&welcome=1#teacher-contact`,
    );
    expect(
      notificationHref('student', 'enrollment_accepted', { group_id: 'not-a-uuid' }, 'ar'),
    ).toBeNull();
    expect(notificationHref('teacher', 'enrollment_accepted', { group_id: uuid }, 'en')).toBeNull();
  });

  it('renders bounded plain text summaries from known kinds', () => {
    expect(notificationSummary('lesson_rescheduled', { title: '<img src=x>' }, 'en')).toContain(
      '<img src=x>',
    );
    expect(notificationSummary('weekly_schedule_changed', {}, 'ar')).toContain('المواعيد');
    expect(notificationSummary('enrollment_accepted', { group_name: 'Algebra group' }, 'en')).toBe(
      "You're accepted! Open Algebra group to contact your teacher and prepare for your first lesson.",
    );
    expect(notificationSummary('enrollment_accepted', { group_name: 'جبر' }, 'ar')).toContain(
      'جبر',
    );
    expect(notificationSummary('unknown', {}, 'en')).toBeNull();
    expect(
      notificationSummary(
        'teacher_fee_announcement',
        { announcement_en: 'Fees begin soon.', effective_at: '2026-05-01T10:00:00Z' },
        'en',
      ),
    ).toContain('Fees begin soon.');
    expect(
      notificationSummary(
        'teacher_fee_announcement',
        { announcement_ar: 'تبدأ الرسوم قريباً' },
        'ar',
      ),
    ).toContain('تبدأ الرسوم قريباً');
  });

  it('renders booking summaries from the actual group, time, student, and source payload', () => {
    const payload = {
      status: 'pending',
      group_name: 'Algebra group',
      starts_at: '2026-10-22T10:00:00Z',
      student_name: 'Nadia',
      source: 'student_proposed',
    };
    const page = parseNotificationsPage({
      rows: [
        {
          id: uuid,
          kind: 'booking_updated',
          payload,
          created_at: '2026-10-21T12:00:00Z',
          read_at: null,
        },
      ],
      total: 1,
      unread: 1,
    });
    expect(page?.rows[0].payload).toEqual(payload);
    const pending = notificationSummary('booking_updated', page!.rows[0].payload, 'en')!;
    expect(pending).toContain('Nadia');
    expect(pending).toContain('Algebra group');
    expect(pending).toContain('22 Oct 2026, 13:00');
    expect(pending).not.toContain('A student');

    const accepted = { ...payload, status: 'accepted' };
    const english = notificationSummary('booking_updated', accepted, 'en')!;
    const arabic = notificationSummary('booking_updated', accepted, 'ar')!;
    expect(english).toContain('Algebra group');
    expect(english).toContain('22 Oct 2026, 13:00');
    expect(arabic).toContain('Algebra group');
    expect(arabic).toContain('٢٢');
  });
});
