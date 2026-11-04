import 'server-only';
import { cache } from 'react';
import { createPublicClient } from '@/lib/supabase/public';
import { idSchema } from '@/features/student/domain';
import type { SeoLocale } from './metadata';

export type TeacherSeo = { id: string; name: string; headline: string | null; subjects: string[] };
export type GroupSeo = {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  teacher: { id: string; name: string };
};
export type PublicEntityResult<T> =
  { kind: 'found'; data: T } | { kind: 'missing' } | { kind: 'unavailable' };

const normalizeSeoUuid = (id: string) => {
  const parsed = idSchema.safeParse(id);
  return parsed.success ? parsed.data.toLowerCase() : null;
};
export const isSeoUuid = (id: string) => normalizeSeoUuid(id) !== null;

const requiredText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const optionalText = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

async function loadPublicTeacherSeo(
  locale: SeoLocale,
  id: string,
): Promise<PublicEntityResult<TeacherSeo>> {
  const normalizedId = normalizeSeoUuid(id);
  if (!normalizedId) return { kind: 'missing' };
  try {
    const db = createPublicClient();
    if (!db) return { kind: 'unavailable' };
    const [teacherResult, subjectResult] = await Promise.all([
      db
        .rpc('public_teachers')
        .select('id,full_name,headline')
        .eq('id', normalizedId)
        .maybeSingle(),
      db
        .rpc('public_teacher_specialization_labels', { p_teacher_id: normalizedId })
        .select('subject_name_en,subject_name_ar'),
    ]);
    if (teacherResult.error || subjectResult.error) return { kind: 'unavailable' };
    if (teacherResult.data === null) return { kind: 'missing' };
    const teacher = teacherResult.data as Record<string, unknown>;
    const teacherId = normalizeSeoUuid(teacher.id as string);
    if (
      teacherId === null ||
      teacherId !== normalizedId ||
      !requiredText(teacher.full_name) ||
      !optionalText(teacher.headline)
    )
      return { kind: 'unavailable' };
    if (!Array.isArray(subjectResult.data)) return { kind: 'unavailable' };
    const subjects: string[] = [];
    for (const item of subjectResult.data as unknown[]) {
      if (!item || typeof item !== 'object') return { kind: 'unavailable' };
      const row = item as Record<string, unknown>;
      if (!optionalText(row.subject_name_en) || !optionalText(row.subject_name_ar))
        return { kind: 'unavailable' };
      const preferred = locale === 'ar' ? row.subject_name_ar : row.subject_name_en;
      const fallback = locale === 'ar' ? row.subject_name_en : row.subject_name_ar;
      const label = (preferred || fallback || '').trim();
      if (label) subjects.push(label);
    }
    return {
      kind: 'found',
      data: {
        id: teacherId,
        name: teacher.full_name.trim(),
        headline: teacher.headline?.trim() || null,
        subjects: [...new Set(subjects)].slice(0, 8),
      },
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

async function loadPublicGroupSeo(
  locale: SeoLocale,
  id: string,
): Promise<PublicEntityResult<GroupSeo>> {
  const normalizedId = normalizeSeoUuid(id);
  if (!normalizedId) return { kind: 'missing' };
  try {
    const db = createPublicClient();
    if (!db) return { kind: 'unavailable' };
    const { data, error } = await db
      .rpc('public_group_detail', { p_group_id: normalizedId })
      .select('id,name,description,teacher_id,teacher_name,subject_name_en,subject_name_ar,status')
      .maybeSingle();
    if (error) return { kind: 'unavailable' };
    if (data === null) return { kind: 'missing' };
    const row = data as Record<string, unknown>;
    if (typeof row.status !== 'string') return { kind: 'unavailable' };
    if (row.status !== 'published') return { kind: 'missing' };
    const groupId = normalizeSeoUuid(row.id as string);
    const teacherId = normalizeSeoUuid(row.teacher_id as string);
    if (
      groupId === null ||
      groupId !== normalizedId ||
      !requiredText(row.name) ||
      !optionalText(row.description) ||
      teacherId === null ||
      !requiredText(row.teacher_name) ||
      !optionalText(row.subject_name_en) ||
      !optionalText(row.subject_name_ar)
    )
      return { kind: 'unavailable' };
    const subject = (
      locale === 'ar'
        ? row.subject_name_ar || row.subject_name_en
        : row.subject_name_en || row.subject_name_ar
    ) as string;
    if (!requiredText(subject)) return { kind: 'unavailable' };
    return {
      kind: 'found',
      data: {
        id: groupId,
        name: row.name.trim(),
        description: row.description?.trim() || null,
        subject: subject.trim(),
        teacher: { id: teacherId, name: row.teacher_name.trim() },
      },
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Per-request memoization shared by generateMetadata and the matching page body. */
export const publicTeacherSeo = cache(loadPublicTeacherSeo);
export const publicGroupSeo = cache(loadPublicGroupSeo);
