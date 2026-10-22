import { STUDENT_PAGE_SIZE } from './pagination-domain';

export type WaitlistStatus = 'waiting' | 'promoted' | 'withdrawn' | 'closed';

export type StudentWaitlistEntry = {
  id: string;
  group_id: string;
  group_name: string | null;
  teacher_name: string | null;
  status: WaitlistStatus;
  enrollment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TeacherWaitlistEntry = StudentWaitlistEntry & {
  student_id: string;
  student_name: string | null;
  can_promote: boolean;
};

export type WaitlistPage<T> = { rows: T[]; total: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function validStatus(value: unknown): value is WaitlistStatus {
  return value === 'waiting' || value === 'promoted' || value === 'withdrawn' || value === 'closed';
}

function parseCommon(row: unknown): StudentWaitlistEntry | null {
  if (
    !isObject(row) ||
    typeof row.id !== 'string' ||
    typeof row.group_id !== 'string' ||
    !nullableString(row.group_name) ||
    !nullableString(row.teacher_name) ||
    !validStatus(row.status) ||
    !nullableString(row.enrollment_id) ||
    typeof row.created_at !== 'string' ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    typeof row.updated_at !== 'string' ||
    !Number.isFinite(Date.parse(row.updated_at))
  )
    return null;
  return {
    id: row.id,
    group_id: row.group_id,
    group_name: row.group_name,
    teacher_name: row.teacher_name,
    status: row.status,
    enrollment_id: row.enrollment_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parsePage<T>(
  input: unknown,
  parseRow: (row: unknown) => T | null,
): WaitlistPage<T> | null {
  if (
    !isObject(input) ||
    !Array.isArray(input.rows) ||
    typeof input.total !== 'number' ||
    !Number.isSafeInteger(input.total) ||
    input.total < 0
  )
    return null;
  const rows = input.rows.map(parseRow);
  if (rows.some(row => row === null)) return null;
  return { rows: rows as T[], total: input.total };
}

export function parseStudentWaitlistPage(
  input: unknown,
): WaitlistPage<StudentWaitlistEntry> | null {
  return parsePage(input, parseCommon);
}

export function parseTeacherWaitlistPage(
  input: unknown,
): WaitlistPage<TeacherWaitlistEntry> | null {
  return parsePage(input, row => {
    const common = parseCommon(row);
    if (
      !common ||
      !isObject(row) ||
      typeof row.student_id !== 'string' ||
      !nullableString(row.student_name) ||
      typeof row.can_promote !== 'boolean'
    )
      return null;
    return {
      ...common,
      student_id: row.student_id,
      student_name: row.student_name,
      can_promote: row.can_promote,
    };
  });
}

export function waitlistPageOffset(page: unknown): number {
  const pageNumber = typeof page === 'number' ? page : Number(page);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) return 0;
  return Math.min((pageNumber - 1) * STUDENT_PAGE_SIZE, 1_000_000);
}

export function normalizeWaitlistPage(page: unknown): number {
  const value = typeof page === 'number' ? page : Number(page);
  if (!Number.isSafeInteger(value) || value < 1) return 1;
  return Math.min(value, 50_001);
}
