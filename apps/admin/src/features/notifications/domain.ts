import { notificationSummary } from '@/features/notifications/domain';

export type AdminNotification = {
  id: string;
  kind: 'teacher_review_requested';
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

export type AdminNotificationsPage = {
  rows: AdminNotification[];
  total: number;
  unread: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdminNotificationsPage(value: unknown): AdminNotificationsPage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > 20 ||
    !Number.isSafeInteger(data.total) ||
    (data.total as number) < 0 ||
    !Number.isSafeInteger(data.unread) ||
    (data.unread as number) < 0
  )
    return null;

  const rows: AdminNotification[] = [];
  for (const value of data.rows) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      !UUID.test(row.id) ||
      row.kind !== 'teacher_review_requested' ||
      !row.payload ||
      typeof row.payload !== 'object' ||
      Array.isArray(row.payload) ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      !(
        row.read_at === null ||
        (typeof row.read_at === 'string' && Number.isFinite(Date.parse(row.read_at)))
      )
    )
      return null;
    rows.push({
      id: row.id,
      kind: 'teacher_review_requested',
      payload: row.payload as Record<string, unknown>,
      created_at: row.created_at,
      read_at: row.read_at as string | null,
    });
  }
  return { rows, total: data.total as number, unread: data.unread as number };
}

export function adminNotificationHref(
  kind: string,
  payload: Record<string, unknown>,
  locale: string,
) {
  if (locale !== 'ar' && locale !== 'en') return null;
  if (kind !== 'teacher_review_requested') return null;
  const teacherId = payload.teacher_id;
  if (typeof teacherId !== 'string' || !UUID.test(teacherId)) return `/${locale}/admin/teachers`;
  return `/${locale}/admin/teachers/${teacherId}`;
}

export function adminNotificationSummary(
  kind: string,
  payload: Record<string, unknown>,
  locale: string,
) {
  if (kind !== 'teacher_review_requested') return null;
  return notificationSummary(kind, payload, locale);
}
