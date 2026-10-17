import { catalogueDisplayName, type CatalogueChoiceNode, type CatalogueChoiceSubject } from '@/features/teacher/catalogue-domain';
import type { Locale } from '@/i18n/config';

export type SetupOfferingChoice = { id: string; label: string };
type SavedOffering = { id: string; node_id: string; subject_id: string };

export function addOfferingChoice(
  choices: SetupOfferingChoice[],
  selectedIds: string[],
  row: SavedOffering,
  subjects: CatalogueChoiceSubject[],
  nodes: CatalogueChoiceNode[],
  locale: Locale,
) {
  const subject = subjects.find(item => item.id === row.subject_id);
  const node = nodes.find(item => item.id === row.node_id);
  const label = [subject && catalogueDisplayName(subject, locale), node && catalogueDisplayName(node, locale)].filter(Boolean).join(' · ');
  const nextChoices = label && !choices.some(item => item.id === row.id)
    ? [...choices, { id: row.id, label }]
    : choices;
  const nextSelectedIds = selectedIds.includes(row.id) ? selectedIds : [...selectedIds, row.id];
  return { choices: nextChoices, selectedIds: nextSelectedIds };
}
