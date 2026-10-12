import { z } from 'zod';
import type { Locale } from '@/features/student/domain';

export type CatalogueLabelInput = { name_ar: string; name_en: string };
export type TeacherCategoryKind = 'custom_year' | 'student_category';
export type CatalogueSelectableRow = {
  id: string;
  owner_teacher_id: string | null;
  archived_at: string | null;
};
export type CatalogueChoiceSubject = CatalogueSelectableRow & CatalogueLabelInput;
export type CatalogueChoiceNode = CatalogueSelectableRow & CatalogueLabelInput & { kind: string; parent_id: string | null };
export type CatalogueChoiceOffering = CatalogueSelectableRow & { node_id: string; subject_id: string };

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

export function isTeacherCatalogueCategory(node: Pick<CatalogueChoiceNode, 'owner_teacher_id' | 'kind'>): boolean {
  return node.owner_teacher_id === null
    ? ['grade', 'university', 'year'].includes(node.kind)
    : ['custom_year', 'student_category'].includes(node.kind);
}

export function filterTeacherCatalogueChoices(
  subjects: CatalogueChoiceSubject[],
  nodes: CatalogueChoiceNode[],
  offerings: CatalogueChoiceOffering[],
  teacherId: string,
) {
  const activeSubjects = subjects.filter(row => row.archived_at === null
    && (row.owner_teacher_id === null || row.owner_teacher_id === teacherId));
  const activeNodes = nodes.filter(row => row.archived_at === null
    && (row.owner_teacher_id === null || row.owner_teacher_id === teacherId));
  const allNodeById = new Map(nodes.map(row => [row.id, row]));
  const nodeById = new Map(activeNodes.map(row => [row.id, row]));
  const subjectIds = new Set(activeSubjects.map(row => row.id));
  const selectableOfferings = offerings.filter(offering => {
    const node = nodeById.get(offering.node_id);
    const subject = activeSubjects.find(row => row.id === offering.subject_id);
    const context = node && isTeacherCatalogueCategory(node);
    return offering.archived_at === null
      && (offering.owner_teacher_id === null || offering.owner_teacher_id === teacherId)
      && !!node && !!subject && !!context && subjectIds.has(subject.id);
  });

  const eligibleContexts = activeNodes.filter(isTeacherCatalogueCategory);
  const usedNodeIds = new Set(eligibleContexts.map(node => node.id));
  for (const nodeId of [...usedNodeIds]) {
    let node = allNodeById.get(nodeId);
    const seen = new Set<string>();
    while (node?.owner_teacher_id === null && node.parent_id && !seen.has(node.id)) {
      seen.add(node.id);
      const parent = allNodeById.get(node.parent_id);
      if (!parent || parent.owner_teacher_id !== null) break;
      usedNodeIds.add(parent.id);
      node = parent;
    }
  }
  return {
    subjects: activeSubjects,
    nodes: nodes.filter(node => (node.owner_teacher_id === null || node.owner_teacher_id === teacherId) && usedNodeIds.has(node.id)),
    offerings: selectableOfferings,
  };
}
