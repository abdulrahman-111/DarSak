import { z } from 'zod';
import { generationRangeSchema } from './generation-domain';

const optionalRangeDate = z.preprocess(
  value => (typeof value === 'string' ? value.trim() : ''),
  z.string().transform(value => value || null),
);

export const publishRangeSchema = z
  .object({
    from: optionalRangeDate,
    until: optionalRangeDate,
  })
  .superRefine(({ from, until }, context) => {
    if (from === null && until === null) return;
    if (from === null || until === null) {
      context.addIssue({
        code: 'custom',
        path: [from === null ? 'from' : 'until'],
        message: 'both',
      });
      return;
    }
    const parsed = generationRangeSchema.safeParse({ from, until });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
    }
  })
  .transform(({ from, until }) => ({ from, until }));

export type PublishRange = z.infer<typeof publishRangeSchema>;

export function publishReviewKey(
  group: {
    id: string;
    name: string;
    description: string;
    offering_id: string;
    capacity: number;
    location: string;
    status: string;
  },
  slots: Array<{ id: string; weekday: number; start_time: string; end_time: string }>,
  exclusions: string[],
): string {
  const orderedSlots = [...slots]
    .map(({ id, weekday, start_time, end_time }) => ({ id, weekday, start_time, end_time }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      offering_id: group.offering_id,
      capacity: group.capacity,
      location: group.location,
      status: group.status,
    },
    slots: orderedSlots,
    exclusions: [...exclusions].sort(),
  });
}

export function publishRangeFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= 'invalid';
  return fieldErrors;
}
