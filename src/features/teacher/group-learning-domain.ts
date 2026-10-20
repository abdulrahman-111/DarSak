import { z } from 'zod';
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(v => (v === '' || v === undefined ? null : v), schema.nullable());
export const groupLearningDetailsSchema = z
  .object({
    outcomes: z.string().trim().max(2000),
    prerequisites: z.string().trim().max(1500),
    delivery_mode: optional(z.enum(['online', 'in_person', 'hybrid'])),
    fee_egp: optional(z.coerce.number().finite().min(0).max(100000).multipleOf(0.01)),
    fee_basis: optional(z.enum(['lesson', 'month', 'semester', 'course'])),
    fee_includes: z.string().trim().max(1000),
  })
  .refine(v => (v.fee_egp === null) === (v.fee_basis === null), {
    message: 'Enter both the fee and its unit.',
    path: ['fee_basis'],
  });
export type GroupLearningInput = z.infer<typeof groupLearningDetailsSchema>;
export type GroupLearningDetails = GroupLearningInput & { group_id: string; updated_at: string };
export function feeLabel(
  locale: string,
  v: Pick<GroupLearningInput, 'fee_egp' | 'fee_basis'>,
): string {
  const ar = locale === 'ar';
  if (v.fee_egp === null || !v.fee_basis)
    return ar
      ? 'اسأل المعلم عن الرسوم بعد قبول انضمامك.'
      : 'Ask the teacher about fees after enrollment approval.';
  const units = {
    lesson: ar ? 'حصة' : 'lesson',
    month: ar ? 'شهر' : 'month',
    semester: ar ? 'فصل دراسي' : 'semester',
    course: ar ? 'دورة' : 'course',
  };
  return `${ar ? 'ج.م' : 'EGP'} ${new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB').format(v.fee_egp)} / ${units[v.fee_basis]}`;
}
