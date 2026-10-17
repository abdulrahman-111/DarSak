import { z } from 'zod';
import { teacherAvatarExtension, teacherAvatarPath, teacherAvatarMaxBytes } from './profile-domain';

export type LocalizedText = { ar: string; en: string };
export type ProfileEntry = {
  id: string;
  title: LocalizedText;
  organization: LocalizedText;
  description: LocalizedText;
  start_year: number | null;
  end_year: number | null;
  current: boolean;
};

/** Empty repeater drafts are useful in the editor, but should not appear to visitors. */
export function profileEntryHasContent(entry: ProfileEntry): boolean {
  return [
    entry.title.ar, entry.title.en,
    entry.organization.ar, entry.organization.en,
    entry.description.ar, entry.description.en,
  ].some(value => value.trim().length > 0)
    || entry.start_year !== null
    || entry.end_year !== null
    || entry.current;
}

export const profileSectionIds = ['about', 'qualifications', 'experience', 'approach', 'goals'] as const;
export type ProfileSectionId = typeof profileSectionIds[number];
export type ProfileLayout = 'classic' | 'compact';
export type ProfilePalette = 'teal' | 'indigo' | 'olive';
export type TeachingMode = 'online' | 'in_person' | 'both';

const localizedText = (maxLength: number) => z.object({
  ar: z.string().max(maxLength),
  en: z.string().max(maxLength),
}).strict();

const currentCairoYear = () => Number(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
}).format(new Date()));

const profileEntrySchema = z.object({
  id: z.string().min(1).max(80),
  title: localizedText(120),
  organization: localizedText(120),
  description: localizedText(1_500),
  start_year: z.number().int().min(1900).nullable(),
  end_year: z.number().int().min(1900).nullable(),
  current: z.boolean(),
}).strict().superRefine((entry, context) => {
  if (entry.start_year !== null && entry.end_year !== null && entry.end_year < entry.start_year) {
    context.addIssue({ code: 'custom', path: ['end_year'], message: 'end_year_before_start_year' });
  }
  if (entry.current && entry.end_year !== null) {
    context.addIssue({ code: 'custom', path: ['end_year'], message: 'current_role_has_end_year' });
  }
});

const profileDetailsShape = z.object({
  about: localizedText(5_000),
  approach: localizedText(2_000),
  goals: localizedText(2_000),
  qualifications: z.array(profileEntrySchema).max(10),
  experience: z.array(profileEntrySchema).max(10),
  languages: z.array(z.string().trim().min(1).max(60)).max(10),
  city: localizedText(120),
  teaching_mode: z.enum(['online', 'in_person', 'both']).nullable(),
  layout: z.enum(['classic', 'compact']),
  palette: z.enum(['teal', 'indigo', 'olive']),
  section_order: z.array(z.enum(profileSectionIds)).length(profileSectionIds.length),
  hidden_sections: z.array(z.enum(profileSectionIds)).max(profileSectionIds.length),
}).strict();

export const richProfileSchema = profileDetailsShape.superRefine((profile, context) => {
  const maximumYear = currentCairoYear() + 1;
  const unique = <T>(items: T[]) => new Set(items).size === items.length;
  if (!unique(profile.section_order)) {
    context.addIssue({ code: 'custom', path: ['section_order'], message: 'duplicate_sections' });
  }
  if (!profileSectionIds.every(section => profile.section_order.includes(section))) {
    context.addIssue({ code: 'custom', path: ['section_order'], message: 'incomplete_section_order' });
  }
  if (!unique(profile.hidden_sections)) {
    context.addIssue({ code: 'custom', path: ['hidden_sections'], message: 'duplicate_sections' });
  }
  for (const field of ['qualifications', 'experience'] as const) {
    profile[field].forEach((entry, index) => {
      for (const yearField of ['start_year', 'end_year'] as const) {
        const year = entry[yearField];
        if (year !== null && year > maximumYear) {
          context.addIssue({ code: 'custom', path: [field, index, yearField], message: 'year_after_current_cairo_year' });
        }
      }
    });
  }
  const entryIds = [...profile.qualifications, ...profile.experience].map(entry => entry.id);
  if (!unique(entryIds)) {
    context.addIssue({ code: 'custom', message: 'duplicate_entry_ids' });
  }
  const serializedBytes = new TextEncoder().encode(JSON.stringify(profile)).byteLength;
  if (serializedBytes > 65_536) {
    context.addIssue({ code: 'custom', message: 'profile_payload_too_large' });
  }
});

export type RichProfileInput = z.infer<typeof richProfileSchema>;

export function emptyRichProfile(): RichProfileInput {
  return {
    about: { ar: '', en: '' },
    approach: { ar: '', en: '' },
    goals: { ar: '', en: '' },
    qualifications: [],
    experience: [],
    languages: [],
    city: { ar: '', en: '' },
    teaching_mode: null,
    layout: 'classic',
    palette: 'teal',
    section_order: [...profileSectionIds],
    hidden_sections: [],
  };
}

export function localizedProfileText(value: LocalizedText, locale: string): string {
  const preferred = locale === 'ar' ? value.ar : value.en;
  const fallback = locale === 'ar' ? value.en : value.ar;
  return preferred || fallback;
}

export type VisibleProfileSection = {
  id: ProfileSectionId;
  value: LocalizedText | ProfileEntry[];
};

export type PublicProfileSection =
  | { id: 'about' | 'approach' | 'goals'; value: LocalizedText }
  | { id: 'qualifications' | 'experience'; value: ProfileEntry[] };

export type PublicTeacherProfileDetails = {
  sections: PublicProfileSection[];
  languages: string[];
  city: LocalizedText;
  teaching_mode: TeachingMode | null;
  layout: ProfileLayout;
  palette: ProfilePalette;
};

const publicEntrySchema = profileEntrySchema;
const publicSectionSchema = z.discriminatedUnion('id', [
  z.object({ id: z.literal('about'), value: localizedText(5_000) }).strict(),
  z.object({ id: z.literal('approach'), value: localizedText(2_000) }).strict(),
  z.object({ id: z.literal('goals'), value: localizedText(2_000) }).strict(),
  z.object({ id: z.literal('qualifications'), value: z.array(publicEntrySchema).max(10) }).strict(),
  z.object({ id: z.literal('experience'), value: z.array(publicEntrySchema).max(10) }).strict(),
]);

/** Strictly validate the anonymous RPC projection before it reaches a renderer. */
export const publicTeacherProfileDetailsSchema = z.object({
  sections: z.array(publicSectionSchema).max(profileSectionIds.length),
  languages: z.array(z.string().trim().min(1).max(60)).max(10),
  city: localizedText(120),
  teaching_mode: z.enum(['online', 'in_person', 'both']).nullable(),
  layout: z.enum(['classic', 'compact']),
  palette: z.enum(['teal', 'indigo', 'olive']),
}).strict().superRefine((profile, context) => {
  const sectionIds = profile.sections.map(section => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) {
    context.addIssue({ code: 'custom', path: ['sections'], message: 'duplicate_sections' });
  }
  const entries = profile.sections.flatMap(section =>
    section.id === 'qualifications' || section.id === 'experience' ? section.value : [],
  );
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    context.addIssue({ code: 'custom', path: ['sections'], message: 'duplicate_entry_ids' });
  }
  if (profile.sections.some(section => Array.isArray(section.value)
    ? section.value.length === 0
    : section.value.ar.length === 0 && section.value.en.length === 0)) {
    context.addIssue({ code: 'custom', path: ['sections'], message: 'empty_public_section' });
  }
  if (new TextEncoder().encode(JSON.stringify(profile)).byteLength > 65_536) {
    context.addIssue({ code: 'custom', message: 'profile_payload_too_large' });
  }
});

export type PublicTeacherVisitorContacts = {
  phone_number: string | null;
  whatsapp_number: string | null;
  contact_email: string | null;
};

/** Build the shared visitor projection from canonical owner data without retaining hidden sections. */
export function visiblePublicTeacherProfile(input: RichProfileInput): PublicTeacherProfileDetails {
  return {
    sections: visibleProfileSections(input) as PublicProfileSection[],
    languages: [...input.languages],
    city: input.city,
    teaching_mode: input.teaching_mode,
    layout: input.layout,
    palette: input.palette,
  };
}

/** Owner previews never receive teacher contact values. */
export function publicVisitorContacts(
  _visibility: string | null | undefined,
  _contacts: PublicTeacherVisitorContacts | null | undefined,
): PublicTeacherVisitorContacts | null {
  return null;
}

/** Return only enabled, non-empty descriptive values in the teacher's chosen order. */
export function visibleProfileSections(input: RichProfileInput): VisibleProfileSection[] {
  const hidden = new Set(input.hidden_sections);
  const visible: VisibleProfileSection[] = [];
  for (const id of input.section_order) {
    if (hidden.has(id)) continue;
    const value = input[id];
    if (Array.isArray(value)) {
      const entries = value.filter(profileEntryHasContent);
      if (entries.length) visible.push({ id, value: entries });
      continue;
    }
    if (value.ar.trim() || value.en.trim()) visible.push({ id, value });
  }
  return visible;
}

export function teacherCoverPath(teacherId: string, fileId: string, mimeType: string): string {
  const avatarPath = teacherAvatarPath(teacherId, fileId, mimeType);
  const [owner, filename] = avatarPath.split('/');
  return `${owner}/cover/${filename}`;
}

export async function teacherCoverImageType(file: {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<string | null> {
  if (!teacherAvatarExtension(file) || file.size > teacherAvatarMaxBytes) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const matches = file.type === 'image/jpeg'
    ? startsWith(0xff, 0xd8, 0xff)
    : file.type === 'image/png'
      ? startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
      : file.type === 'image/webp'
        ? startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
        : false;
  return matches ? file.type : null;
}
