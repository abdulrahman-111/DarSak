import 'server-only';
import type { Locale } from '@/features/student/domain';
import {
  filterTeacherCatalogueChoices,
  type CatalogueChoiceNode,
  type CatalogueChoiceOffering,
  type CatalogueChoiceSubject,
  type CatalogueLabelInput,
  type CatalogueSelectableRow,
  type TeacherCategoryKind,
} from './catalogue-domain';
import { teacherIdentity } from './data';
import { readAllPages } from '@/lib/supabase/paged-query';

export type TeacherCatalogueSubject = CatalogueChoiceSubject;
export type TeacherCatalogueCategory = CatalogueSelectableRow &
  CatalogueLabelInput & {
    kind: TeacherCategoryKind;
    parent_id: string | null;
  };
export type TeacherCatalogueOffering = CatalogueChoiceOffering;
export type TeacherCatalogueNode = CatalogueChoiceNode;

const catalogueChoiceKeys = {
  subjects: ['id', 'owner_teacher_id', 'archived_at', 'name_ar', 'name_en'],
  nodes: ['id', 'owner_teacher_id', 'archived_at', 'parent_id', 'kind', 'name_ar', 'name_en'],
  offerings: ['id', 'owner_teacher_id', 'archived_at', 'node_id', 'subject_id'],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isChoiceRow(
  value: unknown,
  kind: keyof typeof catalogueChoiceKeys,
): value is Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, catalogueChoiceKeys[kind])) return false;
  if (
    typeof value.id !== 'string' ||
    !isNullableString(value.owner_teacher_id) ||
    !isNullableString(value.archived_at)
  )
    return false;
  if (kind === 'subjects')
    return typeof value.name_ar === 'string' && typeof value.name_en === 'string';
  if (kind === 'nodes')
    return (
      isNullableString(value.parent_id) &&
      typeof value.kind === 'string' &&
      typeof value.name_ar === 'string' &&
      typeof value.name_en === 'string'
    );
  return typeof value.node_id === 'string' && typeof value.subject_id === 'string';
}

function isChoicePayload(value: unknown): value is {
  subjects: TeacherCatalogueSubject[];
  nodes: TeacherCatalogueNode[];
  offerings: TeacherCatalogueOffering[];
} {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['subjects', 'nodes', 'offerings']) &&
    Array.isArray(value.subjects) &&
    value.subjects.every(row => isChoiceRow(row, 'subjects')) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(row => isChoiceRow(row, 'nodes')) &&
    Array.isArray(value.offerings) &&
    value.offerings.every(row => isChoiceRow(row, 'offerings'))
  );
}

const loadError = (locale: Locale) =>
  locale === 'ar'
    ? 'تعذر تحميل دليلك التعليمي. حاول مرة أخرى.'
    : 'Could not load your catalogue. Please try again.';

export async function teacherCatalogue(locale: Locale) {
  const me = await teacherIdentity(locale);
  const [subjects, categories] = await Promise.all([
    readAllPages((from, to) =>
      me.db
        .from('subjects')
        .select('id,owner_teacher_id,archived_at,name_ar,name_en')
        .eq('owner_teacher_id', me.id)
        .order('name_en')
        .order('id')
        .range(from, to),
    ),
    readAllPages((from, to) =>
      me.db
        .from('education_nodes')
        .select('id,owner_teacher_id,archived_at,parent_id,kind,name_ar,name_en')
        .eq('owner_teacher_id', me.id)
        .in('kind', ['custom_year', 'student_category'])
        .order('name_en')
        .order('id')
        .range(from, to),
    ),
  ]);
  const error = subjects.error || categories.error ? loadError(locale) : null;
  return {
    me,
    subjects: error ? [] : (subjects.data as TeacherCatalogueSubject[]),
    categories: error ? [] : (categories.data as TeacherCatalogueCategory[]),
    error,
  };
}

export async function teacherCatalogueChoices(
  db: Awaited<ReturnType<typeof teacherIdentity>>['db'],
  teacherId: string,
) {
  try {
    const result = await db.rpc('teacher_catalogue_choices');
    if (result.error || !isChoicePayload(result.data))
      return { subjects: [], nodes: [], offerings: [], error: { error: true as const } };

    return {
      ...filterTeacherCatalogueChoices(
        result.data.subjects,
        result.data.nodes,
        result.data.offerings,
        teacherId,
      ),
      error: { error: false as const },
    };
  } catch {
    return { subjects: [], nodes: [], offerings: [], error: { error: true as const } };
  }
}
