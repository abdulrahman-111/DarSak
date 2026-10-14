import 'server-only';
import type { Locale } from '@/features/student/domain';
import { filterTeacherCatalogueChoices, type CatalogueChoiceNode, type CatalogueChoiceOffering, type CatalogueChoiceSubject, type CatalogueLabelInput, type CatalogueSelectableRow, type TeacherCategoryKind } from './catalogue-domain';
import { teacherViewer } from './data';
import { readAllPages } from '@/lib/supabase/paged-query';

export type TeacherCatalogueSubject = CatalogueChoiceSubject;
export type TeacherCatalogueCategory = CatalogueSelectableRow & CatalogueLabelInput & {
  kind: TeacherCategoryKind;
  parent_id: string | null;
};
export type TeacherCatalogueOffering = CatalogueChoiceOffering;
export type TeacherCatalogueNode = CatalogueChoiceNode;

const loadError = (locale: Locale) => locale === 'ar'
  ? 'تعذر تحميل دليلك التعليمي. حاول مرة أخرى.'
  : 'Could not load your catalogue. Please try again.';

export async function teacherCatalogue(locale: Locale) {
  const me = await teacherViewer(locale);
  const [subjects, categories] = await Promise.all([
    readAllPages((from, to) => me.db.from('subjects').select('id,owner_teacher_id,archived_at,name_ar,name_en').eq('owner_teacher_id', me.id).order('name_en').order('id').range(from, to)),
    readAllPages((from, to) => me.db.from('education_nodes').select('id,owner_teacher_id,archived_at,parent_id,kind,name_ar,name_en').eq('owner_teacher_id', me.id).in('kind', ['custom_year', 'student_category']).order('name_en').order('id').range(from, to)),
  ]);
  const error = subjects.error || categories.error ? loadError(locale) : null;
  return {
    me,
    subjects: error ? [] : subjects.data as TeacherCatalogueSubject[],
    categories: error ? [] : categories.data as TeacherCatalogueCategory[],
    error,
  };
}

export async function teacherCatalogueChoices(db: Awaited<ReturnType<typeof teacherViewer>>['db'], teacherId: string) {
  const [subjects, nodes, offerings] = await Promise.all([
    readAllPages((from, to) => db.from('subjects').select('id,owner_teacher_id,archived_at,name_ar,name_en').or(`owner_teacher_id.is.null,owner_teacher_id.eq.${teacherId}`).order('id').range(from, to)),
    readAllPages((from, to) => db.from('education_nodes').select('id,owner_teacher_id,archived_at,parent_id,kind,name_ar,name_en').or(`owner_teacher_id.is.null,owner_teacher_id.eq.${teacherId}`).order('id').range(from, to)),
    readAllPages((from, to) => db.from('offerings').select('id,owner_teacher_id,archived_at,node_id,subject_id').or(`owner_teacher_id.is.null,owner_teacher_id.eq.${teacherId}`).order('id').range(from, to)),
  ]);
  const error = subjects.error || nodes.error || offerings.error ? { error: true as const } : { error: false as const };
  if (error.error) return { subjects: [], nodes: [], offerings: [], error };

  return {
    ...filterTeacherCatalogueChoices(
      subjects.data as TeacherCatalogueSubject[],
      nodes.data as TeacherCatalogueNode[],
      offerings.data as TeacherCatalogueOffering[],
      teacherId,
    ),
    error,
  };
}
