import { z } from 'zod';
import type { Locale } from '@/features/student/domain';

export type CatalogueLabelInput = { name_ar: string; name_en: string };
export type TeacherCategoryKind = 'custom_year' | 'student_category';
export type CatalogueSelectableRow = {
  id: string;
  owner_teacher_id: string | null;
  archived_at: string | null;
};

const catalogueLabelFields = {
  name_ar: z.string().trim().max(120),
  name_en: z.string().trim().max(120),
};

function requireAtLeastOneLabel(
  value: CatalogueLabelInput,
  context: z.RefinementCtx,
) {
  if (!value.name_ar && !value.name_en) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter a name in Arabic or English',
      path: ['name_ar'],
    });
  }
}

export const catalogueLabelSchema = z.object(catalogueLabelFields).superRefine(requireAtLeastOneLabel);

export const teacherCategorySchema = z.object({
  ...catalogueLabelFields,
  kind: z.enum(['custom_year', 'student_category']),
}).superRefine(requireAtLeastOneLabel);

export function catalogueDisplayName(row: CatalogueLabelInput, locale: Locale): string {
  const arabic = row.name_ar.trim();
  const english = row.name_en.trim();
  return locale === 'ar' ? arabic || english : english || arabic;
}

export function canSelectCatalogueRow(
  row: CatalogueSelectableRow,
  teacherId: string,
  retainedId?: string,
): boolean {
  const isSharedOrOwned = row.owner_teacher_id === null || row.owner_teacher_id === teacherId;
  const isActiveOrRetained = row.archived_at === null || row.id === retainedId;
  return isSharedOrOwned && isActiveOrRetained;
}
