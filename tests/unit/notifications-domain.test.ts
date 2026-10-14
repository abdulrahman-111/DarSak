import { describe, expect, it } from 'vitest';
import { notificationHref, notificationSummary, parseNotificationsPage } from '@/features/notifications/domain';

const uuid = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';

describe('notifications domain', () => {
  it('bounds pages and exposes only notification row fields', () => {
    expect(parseNotificationsPage({ rows: [{ id: uuid, kind: 'lesson_rescheduled', payload: { title: '<b>Math</b>' }, created_at: '2026-10-14T12:00:00Z', read_at: null, recipient_id: uuid }], total: 21, unread: 1 })).toMatchObject({
      rows: [{ id: uuid, kind: 'lesson_rescheduled', payload: { title: '<b>Math</b>' }, read_at: null }], total: 21, unread: 1,
    });
    expect(parseNotificationsPage({ rows: [], total: -1, unread: 0 })).toBeNull();
  });

  it('uses role and valid source ids to build notification links', () => {
    expect(notificationHref('student', 'lesson_rescheduled', { lesson_id: uuid }, 'en')).toBe(`/en/student/lessons/${uuid}`);
    expect(notificationHref('admin', 'teacher_review_requested', { teacher_id: uuid }, 'ar')).toBe(`/ar/admin/teachers/${uuid}`);
    expect(notificationHref('teacher', 'enrollment_requested', { group_id: uuid }, 'en')).toBe(`/en/teacher/requests?group_id=${uuid}`);
    expect(notificationHref('student', 'lesson_rescheduled', { lesson_id: 'javascript:alert(1)' }, 'en')).toBeNull();
    expect(notificationHref('teacher','teacher_fee_announcement',{},'ar')).toBe('/ar/teacher/access');
  });

  it('renders bounded plain text summaries from known kinds', () => {
    expect(notificationSummary('lesson_rescheduled', { title: '<img src=x>' }, 'en')).toContain('<img src=x>');
    expect(notificationSummary('weekly_schedule_changed', {}, 'ar')).toContain('المواعيد');
    expect(notificationSummary('unknown', {}, 'en')).toBeNull();
    expect(notificationSummary('teacher_fee_announcement',{announcement_en:'Fees begin soon.',effective_at:'2026-05-01T10:00:00Z'},'en')).toContain('Fees begin soon.');
    expect(notificationSummary('teacher_fee_announcement',{announcement_ar:'تبدأ الرسوم قريباً'},'ar')).toContain('تبدأ الرسوم قريباً');
  });
});
