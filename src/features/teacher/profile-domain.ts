import { z } from 'zod';

const optionalContact = z.string().trim().transform(value => value || null);
const phone = optionalContact.refine(value => value === null || /^\+[1-9]\d{7,14}$/.test(value), 'phone');
const contactEmail = optionalContact.refine(value => value === null || (value.length <= 254 && z.string().email().safeParse(value).success), 'email');

export const teacherProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  headline: z.string().trim().max(160),
  bio: z.string().trim().max(5000),
  offering_ids: z.array(z.string().uuid()).refine(ids => new Set(ids).size === ids.length, 'distinct'),
  phone_number: phone,
  whatsapp_number: phone,
  contact_email: contactEmail,
  visibility: z.enum(['enrolled', 'public']).default('enrolled'),
});

export type TeacherProfileInput = z.infer<typeof teacherProfileSchema>;

export type ProfileFormValues = {
  full_name: string;
  headline: string;
  bio: string;
  offering_ids: string[];
  phone_number: string;
  whatsapp_number: string;
  contact_email: string;
  visibility: 'enrolled' | 'public';
};

export function profileFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    fieldErrors[field] ??= field === 'offering_ids' && issue.message === 'distinct' ? 'distinct' : 'invalid';
  }
  return fieldErrors;
}
