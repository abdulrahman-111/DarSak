import { z } from 'zod';
import { teacherAvatarPath } from './profile-domain';

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
  start_year: z.number().int().min(1900).max(currentCairoYear() + 1).nullable(),
  end_year: z.number().int().min(1900).max(currentCairoYear() + 1).nullable(),
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

/** Return only enabled, non-empty descriptive values in the teacher's chosen order. */
export function visibleProfileSections(input: RichProfileInput): VisibleProfileSection[] {
  const hidden = new Set(input.hidden_sections);
  return input.section_order.flatMap(id => {
    if (hidden.has(id)) return [];
    const value = input[id];
    const hasContent = Array.isArray(value)
      ? value.length > 0
      : value.ar.length > 0 || value.en.length > 0;
    return hasContent ? [{ id, value }] : [];
  });
}

export function teacherCoverPath(teacherId: string, fileId: string, mimeType: string): string {
  const avatarPath = teacherAvatarPath(teacherId, fileId, mimeType);
  const [owner, filename] = avatarPath.split('/');
  return `${owner}/cover/${filename}`;
}
