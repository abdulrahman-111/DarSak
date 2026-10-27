import { describe, expect, it } from 'vitest';
import {
  adminNotificationHref,
  parseAdminNotificationsPage,
} from '@admin/features/notifications/domain';

const notificationId = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';
const teacherId = 'b2c4888a-7630-4e7b-aabc-66310e5a5bc9';

describe('admin notifications', () => {
  it('accepts bounded teacher-review notification pages only', () => {
    expect(
      parseAdminNotificationsPage({
        rows: [
          {
            id: notificationId,
            kind: 'teacher_review_requested',
            payload: { teacher_id: teacherId, teacher_name: 'A teacher' },
            created_at: '2026-10-27T12:00:00Z',
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      })?.rows[0].kind,
    ).toBe('teacher_review_requested');
    expect(parseAdminNotificationsPage({ rows: [], total: -1, unread: 0 })).toBeNull();
    expect(
      parseAdminNotificationsPage({
        rows: [
          {
            id: notificationId,
            kind: 'booking_updated',
            payload: {},
            created_at: '2026-10-27T12:00:00Z',
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      }),
    ).toBeNull();
  });

  it('creates only local admin destinations from a verified notification kind', () => {
    expect(adminNotificationHref('teacher_review_requested', { teacher_id: teacherId }, 'en')).toBe(
      `/en/admin/teachers/${teacherId}`,
    );
    expect(
      adminNotificationHref(
        'teacher_review_requested',
        { teacher_id: 'javascript:alert(1)' },
        'ar',
      ),
    ).toBe('/ar/admin/teachers');
    expect(
      adminNotificationHref('booking_updated', { url: 'https://example.com' }, 'en'),
    ).toBeNull();
    expect(adminNotificationHref('teacher_review_requested', {}, 'fr')).toBeNull();
  });
});
