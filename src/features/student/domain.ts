import { z } from 'zod';
export const idSchema = z.string().uuid();
export type Locale = 'ar' | 'en';
export type EnrollmentStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'removed';
export function canRequest(status?: string) {
  return !status || ['rejected', 'cancelled', 'removed'].includes(status);
}
export function canCancel(status: string) {
  return status === 'pending' || status === 'accepted';
}
export function safeLink(value: string | null) {
  try {
    const url = new URL(value || '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function descendantIds(nodes: { id: string; parent_id: string | null }[], root: string) {
  const ids = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (n.parent_id && ids.has(n.parent_id) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
  }
  return [...ids];
}
export function recurringConflict(
  a: { weekday: number; start_time: string; end_time: string },
  b: { weekday: number; start_time: string; end_time: string },
) {
  return a.weekday === b.weekday && a.start_time < b.end_time && b.start_time < a.end_time;
}
export function dateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}
