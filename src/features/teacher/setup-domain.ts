import { z } from 'zod';
import type { Locale } from '@/features/student/domain';

const capacitySchema = z.preprocess(value => value === '' || value == null ? 10 : value, z.coerce.number().int().min(1).max(500));

export const groupDetailsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  offering_id: z.string().uuid(),
  capacity: capacitySchema,
  location: z.string().trim().max(200).default(''),
});

export type GroupDetailsInput = z.infer<typeof groupDetailsSchema>;
export type SetupStep = 'details' | 'schedule' | 'review';

export function normalizeSetupStep(value: string | string[] | undefined): SetupStep {
  const step = Array.isArray(value) ? value[0] : value;
  return step === 'schedule' || step === 'review' ? step : 'details';
}

export type SetupCatalogueNode = { id: string; parent_id: string | null; name_ar: string; name_en: string };
export type SetupCatalogueSubject = { id: string; name_ar: string; name_en: string };
export type SetupCatalogueOffering = { id: string; node_id: string; subject_id: string };
export type SetupCatalogueChoice = { id: string; subject: string; context: string; label: string };

export function setupCatalogueChoices(
  locale: Locale,
  nodes: SetupCatalogueNode[],
  subjects: SetupCatalogueSubject[],
  offerings: SetupCatalogueOffering[],
): SetupCatalogueChoice[] {
  const ar = locale === 'ar';
  const name = (item: { name_ar: string; name_en: string }) => ar ? item.name_ar : item.name_en;
  const contextFor = (nodeId: string) => {
    const labels: string[] = [];
    const seen = new Set<string>();
    let current = nodes.find(item => item.id === nodeId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      labels.unshift(name(current));
      current = current.parent_id ? nodes.find(item => item.id === current?.parent_id) : undefined;
    }
    return labels.filter(Boolean).join(' › ');
  };

  return offerings.flatMap(offering => {
    const subject = subjects.find(item => item.id === offering.subject_id);
    const subjectLabel = subject ? name(subject) : '';
    const context = contextFor(offering.node_id);
    if (!subjectLabel || !context) return [];
    return [{ id: offering.id, subject: subjectLabel, context, label: `${subjectLabel} · ${context}` }];
  }).sort((a, b) => a.label.localeCompare(b.label, ar ? 'ar' : 'en'));
}

export function groupDetailsFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= 'invalid';
  return fieldErrors;
}
