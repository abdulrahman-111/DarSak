import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeStudentPage } from '@/features/student/pagination-domain';

export const ATTENDANCE_PAGE_SIZE = 20;
export const MAX_ATTENDANCE_PAGE = 50_000;
export function normalizeAttendancePage(value: unknown): number {
  return Math.min(MAX_ATTENDANCE_PAGE, normalizeStudentPage(value));
}
export function attendancePageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ATTENDANCE_PAGE_SIZE));
}
export function clampAttendancePage(page: number, total: number): number {
  return Math.min(page, attendancePageCount(total));
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AttendanceRow = { student_id: string; full_name: string; status: AttendanceStatus | null; recorded_at: string | null };
export type AttendancePage = { rows: AttendanceRow[]; total: number };

export async function teacherAttendancePage(db: SupabaseClient, lessonId: string, offset: number): Promise<AttendancePage | null> {
  const { data, error } = await db.rpc('teacher_lesson_attendance_page', { p_lesson_id: lessonId, p_offset: offset, p_limit: 20 });
  if (error || !data || !Array.isArray(data.rows) || !Number.isSafeInteger(data.total) || data.total < 0) return null;
  return data as AttendancePage;
}

export function attendancePageHref(locale: string, lessonId: string, page: number, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'attendance_page' || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  if (page > 1) params.set('attendance_page', String(page));
  const suffix = params.toString();
  return `/${locale}/teacher/lessons/${lessonId}${suffix ? `?${suffix}` : ''}`;
}
