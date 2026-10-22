import { z } from 'zod';

export const bookingIdSchema = z.string().uuid();
export const BOOKING_PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['pending', 'accepted', 'declined', 'withdrawn', 'cancelled']);
const SLOT_STATUSES = new Set(['open', 'cancelled']);
export type BookingRow = {
  id: string;
  slot_id: string;
  group_id: string;
  group_name: string;
  teacher_name: string;
  student_name?: string;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'cancelled';
  source?: 'teacher_published' | 'student_proposed';
};
export type BookingSlotRow = {
  id: string;
  group_id: string;
  group_name: string;
  teacher_name: string;
  starts_at: string;
  ends_at: string;
  status: 'open' | 'cancelled';
};
export type BookingPage = { rows: BookingRow[]; total: number };
export type BookingSlots = { rows: BookingSlotRow[]; total: number };

export function normalizeBookingPage(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const raw = typeof candidate === 'string' ? Number(candidate) : Number.NaN;
  return Number.isSafeInteger(raw) && raw > 0 && raw < 10000 ? raw : 1;
}
export function bookingPageCount(total: number) {
  return Math.max(1, Math.ceil(total / BOOKING_PAGE_SIZE));
}
function validDatePair(row: Record<string, unknown>) {
  return (
    typeof row.starts_at === 'string' &&
    Number.isFinite(Date.parse(row.starts_at)) &&
    typeof row.ends_at === 'string' &&
    Number.isFinite(Date.parse(row.ends_at)) &&
    Date.parse(row.starts_at) < Date.parse(row.ends_at)
  );
}
function validBase(row: Record<string, unknown>) {
  return (
    typeof row.id === 'string' &&
    UUID.test(row.id) &&
    typeof row.group_id === 'string' &&
    UUID.test(row.group_id) &&
    typeof row.group_name === 'string' &&
    row.group_name.length <= 160 &&
    typeof row.teacher_name === 'string' &&
    row.teacher_name.length <= 160 &&
    validDatePair(row)
  );
}
export function parseBookingPage(value: unknown): BookingPage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > BOOKING_PAGE_SIZE ||
    !Number.isSafeInteger(data.total) ||
    (data.total as number) < 0
  )
    return null;
  const rows: BookingRow[] = [];
  for (const item of data.rows) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (
      !validBase(row) ||
      typeof row.slot_id !== 'string' ||
      !UUID.test(row.slot_id) ||
      typeof row.status !== 'string' ||
      !STATUSES.has(row.status) ||
      (row.source !== undefined &&
        row.source !== 'teacher_published' &&
        row.source !== 'student_proposed') ||
      ('student_name' in row && row.student_name !== null && typeof row.student_name !== 'string')
    )
      return null;
    rows.push({
      id: row.id as string,
      slot_id: row.slot_id,
      group_id: row.group_id as string,
      group_name: row.group_name as string,
      teacher_name: row.teacher_name as string,
      ...(typeof row.student_name === 'string'
        ? { student_name: row.student_name.slice(0, 160) }
        : {}),
      starts_at: row.starts_at as string,
      ends_at: row.ends_at as string,
      status: row.status as BookingRow['status'],
      source: row.source === 'student_proposed' ? 'student_proposed' : 'teacher_published',
    });
  }
  return { rows, total: data.total as number };
}
export function parseBookingSlots(value: unknown): BookingSlots | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > BOOKING_PAGE_SIZE ||
    !Number.isSafeInteger(data.total) ||
    (data.total as number) < 0
  )
    return null;
  const rows: BookingSlotRow[] = [];
  for (const item of data.rows) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (!validBase(row) || typeof row.status !== 'string' || !SLOT_STATUSES.has(row.status))
      return null;
    rows.push({
      id: row.id as string,
      group_id: row.group_id as string,
      group_name: row.group_name as string,
      teacher_name: row.teacher_name as string,
      starts_at: row.starts_at as string,
      ends_at: row.ends_at as string,
      status: row.status as BookingSlotRow['status'],
    });
  }
  return { rows, total: data.total as number };
}
