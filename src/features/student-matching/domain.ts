import type { Locale } from '@/features/student/domain';
import type { DiscoverGroupRow } from '@/lib/supabase/types';

export const RECOMMENDATION_PAGE_SIZE = 12;
const MAX_PAGE = Math.floor(1_000_000 / RECOMMENDATION_PAGE_SIZE) + 1;
export const MATCHING_REASON_CODES = [
  'interest_subject_text',
  'education_label_text',
  'goal_subject_text',
  'preferred_weekday',
] as const;
export type MatchingReasonCode = (typeof MATCHING_REASON_CODES)[number];
export type Recommendation = { group: DiscoverGroupRow; reasonCodes: MatchingReasonCode[] };
export type RecommendationsPage = {
  rows: Recommendation[];
  total: number;
  hasProfileSignals: boolean;
  preferredWeekdays: number[];
  profileUpdatedAt: string | null;
};
export type MatchingPreferences = { preferredWeekdays: number[]; updatedAt: string };

export function normalizeRecommendationsPage(value: unknown): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' && typeof candidate !== 'number') return 1;
  const page = Number(candidate);
  return Number.isSafeInteger(page) && page > 0 && page <= MAX_PAGE ? page : 1;
}

export function recommendationPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / RECOMMENDATION_PAGE_SIZE));
}

function parseWeekdays(value: unknown): number[] | null {
  if (value === null) return [];
  if (
    !Array.isArray(value) ||
    value.length > 7 ||
    !value.every(day => Number.isInteger(day) && day >= 0 && day <= 6) ||
    new Set(value).size !== value.length
  )
    return null;
  return [...value].sort((a, b) => a - b) as number[];
}

export function parseMatchingPreferences(value: unknown): MatchingPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const preferredWeekdays = parseWeekdays(row.preferred_weekdays);
  if (
    !preferredWeekdays ||
    typeof row.updated_at !== 'string' ||
    !Number.isFinite(Date.parse(row.updated_at))
  )
    return null;
  return { preferredWeekdays, updatedAt: row.updated_at };
}

export function parsePreferredWeekdayInput(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length > 7) return null;
  const parsed: number[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !/^[0-6]$/.test(value)) return null;
    parsed.push(Number(value));
  }
  if (new Set(parsed).size !== parsed.length) return null;
  return parsed.sort((a, b) => a - b);
}

function parseRecommendationGroup(value: unknown): DiscoverGroupRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const weekdays = parseWeekdays(row.weekdays);
  if (
    typeof row.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id) ||
    typeof row.teacher_id !== 'string' ||
    typeof row.offering_id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.description !== 'string' ||
    typeof row.capacity !== 'number' ||
    row.status !== 'published' ||
    typeof row.location !== 'string' ||
    typeof row.created_at !== 'string' ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    typeof row.teacher_name !== 'string' ||
    typeof row.subject_name_ar !== 'string' ||
    typeof row.subject_name_en !== 'string' ||
    typeof row.node_name_ar !== 'string' ||
    typeof row.node_name_en !== 'string' ||
    typeof row.accepted_count !== 'number' ||
    typeof row.available_seats !== 'number' ||
    !weekdays ||
    !(
      row.next_lesson_at === null ||
      (typeof row.next_lesson_at === 'string' && Number.isFinite(Date.parse(row.next_lesson_at)))
    )
  )
    return null;
  return {
    id: row.id,
    teacher_id: row.teacher_id,
    offering_id: row.offering_id,
    name: row.name,
    description: row.description,
    capacity: row.capacity,
    status: 'published',
    location: row.location,
    created_at: row.created_at,
    teacher_name: row.teacher_name,
    subject_name_ar: row.subject_name_ar,
    subject_name_en: row.subject_name_en,
    node_name_ar: row.node_name_ar,
    node_name_en: row.node_name_en,
    accepted_count: row.accepted_count,
    available_seats: row.available_seats,
    weekdays,
    next_lesson_at: row.next_lesson_at as string | null,
  };
}

export function parseRecommendationsPage(value: unknown): RecommendationsPage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const preferredWeekdays = parseWeekdays(data.preferred_weekdays);
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > RECOMMENDATION_PAGE_SIZE ||
    !Number.isSafeInteger(data.total) ||
    (data.total as number) < 0 ||
    typeof data.has_profile_signals !== 'boolean' ||
    !preferredWeekdays ||
    !(
      data.profile_updated_at === null ||
      (typeof data.profile_updated_at === 'string' &&
        Number.isFinite(Date.parse(data.profile_updated_at)))
    )
  )
    return null;
  const rows: Recommendation[] = [];
  for (const value of data.rows) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    const group = parseRecommendationGroup(row);
    if (
      !group ||
      !Array.isArray(row.reason_codes) ||
      row.reason_codes.length > MATCHING_REASON_CODES.length ||
      !row.reason_codes.every(code => MATCHING_REASON_CODES.includes(code as MatchingReasonCode)) ||
      new Set(row.reason_codes).size !== row.reason_codes.length
    )
      return null;
    rows.push({ group, reasonCodes: row.reason_codes as MatchingReasonCode[] });
  }
  return {
    rows,
    total: data.total as number,
    hasProfileSignals: data.has_profile_signals,
    preferredWeekdays,
    profileUpdatedAt: data.profile_updated_at as string | null,
  };
}

const weekdayNames: Record<Locale, [string, string, string, string, string, string, string]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};
export function weekdayName(day: number, locale: Locale): string {
  return weekdayNames[locale][day] ?? '';
}

export function matchingReasonLabel(code: MatchingReasonCode, locale: Locale): string {
  const labels: Record<MatchingReasonCode, [string, string]> = {
    interest_subject_text: [
      'Shares a topic with your interests',
      'يرتبط موضوع المجموعة بأحد اهتماماتك',
    ],
    education_label_text: [
      'Study-stage label appears in your profile',
      'اسم المرحلة الدراسية موجود في ملفك',
    ],
    goal_subject_text: [
      'Topic label appears in your learning goal',
      'اسم الموضوع موجود في هدفك التعليمي',
    ],
    preferred_weekday: ['Includes one of your preferred days', 'يتضمن أحد أيامك المفضلة'],
  };
  const label = labels[code];
  return label[locale === 'ar' ? 1 : 0];
}
