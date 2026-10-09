import { z } from 'zod';

export const teacherAvatarMaxBytes = 2_097_152;
const avatarExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function teacherAvatarExtension(file: { type: string; size: number }): string | null {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > teacherAvatarMaxBytes) return null;
  return avatarExtensions[file.type] ?? null;
}

export function teacherAvatarPath(teacherId: string, fileId: string, mimeType: string): string {
  const uuid = z.string().uuid();
  const owner = uuid.parse(teacherId);
  const objectId = uuid.parse(fileId);
  const extension = avatarExtensions[mimeType];
  if (!extension) throw new Error('Unsupported teacher avatar image type');
  return `${owner}/${objectId}.${extension}`;
}

export function storageRemovalConfirmed(path: string, data: Array<{ name: string }> | null, error: unknown): boolean {
  return !error && !!data?.some(object => object.name === path);
}

export function avatarPathIsCurrent(expectedPath: string, currentPath: string | null): boolean {
  return currentPath === expectedPath;
}

export function publicTeacherContactLinks(contacts: {
  phone_number?: string | null;
  whatsapp_number?: string | null;
  contact_email?: string | null;
}) {
  const e164 = (value?: string | null) => value && /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
  const phone = e164(contacts.phone_number);
  const whatsapp = e164(contacts.whatsapp_number);
  const email = contacts.contact_email && contacts.contact_email.length <= 254 && z.string().email().safeParse(contacts.contact_email).success
    ? contacts.contact_email
    : null;
  return {
    phone: phone ? `tel:${phone}` : null,
    whatsapp: whatsapp ? `https://wa.me/${whatsapp.slice(1)}` : null,
    email: email ? `mailto:${email}` : null,
  };
}

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
