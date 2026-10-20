import { describe, expect, it, vi } from 'vitest';
import {
  emptyRichProfile,
  localizedProfileText,
  publicTeacherProfileDetailsSchema,
  richProfileSchema,
  visiblePublicTeacherProfile,
  visibleProfileSections,
  type RichProfileInput,
} from '@/features/teacher/profile-details-domain';

describe('teacher profile details', () => {
  it('single_language_falls_back', () => {
    expect(localizedProfileText({ ar: '', en: 'Teaching with care' }, 'ar')).toBe(
      'Teaching with care',
    );
    expect(localizedProfileText({ ar: 'التدريس باهتمام', en: '' }, 'en')).toBe('التدريس باهتمام');
  });

  it('optional_empty_profile_valid', () => {
    expect(richProfileSchema.safeParse(emptyRichProfile()).success).toBe(true);
  });

  it('unknown_or_duplicate_sections_rejected', () => {
    const base = emptyRichProfile();
    expect(richProfileSchema.safeParse({ ...base, layout: 'fancy' }).success).toBe(false);
    const unknownSection = richProfileSchema.safeParse({
      ...base,
      section_order: ['about', 'qualifications', 'experience', 'approach', 'unknown'],
    });
    expect(unknownSection.success).toBe(false);
    if (!unknownSection.success) {
      expect(
        unknownSection.error.issues.some(issue => issue.path.join('.') === 'section_order.4'),
      ).toBe(true);
    }
    const duplicateSection = richProfileSchema.safeParse({
      ...base,
      section_order: ['about', 'about', 'experience', 'approach', 'goals'],
    });
    expect(duplicateSection.success).toBe(false);
    if (!duplicateSection.success) {
      expect(
        duplicateSection.error.issues.some(issue => issue.message === 'duplicate_sections'),
      ).toBe(true);
    }
    expect(
      richProfileSchema.safeParse({ ...base, hidden_sections: ['about', 'about'] }).success,
    ).toBe(false);
  });

  it('entry_and_total_payload_limits', () => {
    const base = emptyRichProfile();
    const entry = (id: string) => ({
      id,
      title: { ar: '', en: 'A'.repeat(120) },
      organization: { ar: '', en: '' },
      description: { ar: '', en: 'D'.repeat(1_500) },
      start_year: null,
      end_year: null,
      current: false,
    });
    expect(
      richProfileSchema.safeParse({
        ...base,
        qualifications: Array.from({ length: 10 }, (_, i) => entry(`q${i}`)),
      }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({
        ...base,
        qualifications: Array.from({ length: 11 }, (_, i) => entry(`q${i}`)),
      }).success,
    ).toBe(false);
    expect(
      richProfileSchema.safeParse({ ...base, city: { ar: '', en: 'C'.repeat(120) } }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({ ...base, city: { ar: '', en: 'C'.repeat(121) } }).success,
    ).toBe(false);
    expect(
      richProfileSchema.safeParse({
        ...base,
        languages: Array.from({ length: 10 }, (_, i) => `L${i}`),
      }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({
        ...base,
        languages: Array.from({ length: 11 }, (_, i) => `L${i}`),
      }).success,
    ).toBe(false);
    expect(
      richProfileSchema.safeParse({ ...base, about: { ar: '', en: 'A'.repeat(5_000) } }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({ ...base, about: { ar: '', en: 'A'.repeat(5_001) } }).success,
    ).toBe(false);
    expect(
      richProfileSchema.safeParse({ ...base, approach: { ar: '', en: 'A'.repeat(2_000) } }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({ ...base, approach: { ar: '', en: 'A'.repeat(2_001) } }).success,
    ).toBe(false);
    expect(
      richProfileSchema.safeParse({ ...base, goals: { ar: '', en: 'G'.repeat(2_000) } }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({ ...base, goals: { ar: '', en: 'G'.repeat(2_001) } }).success,
    ).toBe(false);

    const fullEntry = (id: string) => ({
      id,
      title: { ar: 'A'.repeat(120), en: 'T'.repeat(120) },
      organization: { ar: 'M'.repeat(120), en: 'O'.repeat(120) },
      description: { ar: 'W'.repeat(1_500), en: 'D'.repeat(1_500) },
      start_year: 1900,
      end_year: null,
      current: false,
    });
    const atPayloadLimit = {
      ...base,
      qualifications: Array.from({ length: 10 }, (_, i) => fullEntry(`q${i}`)),
      experience: Array.from({ length: 10 }, (_, i) => fullEntry(`e${i}`)),
    };
    const allEntries = [...atPayloadLimit.qualifications, ...atPayloadLimit.experience];
    for (const currentEntry of allEntries) {
      const byteLength = new TextEncoder().encode(JSON.stringify(atPayloadLimit)).byteLength;
      if (byteLength <= 65_536) break;
      const excess = byteLength - 65_536;
      currentEntry.description.en = currentEntry.description.en.slice(
        0,
        Math.max(0, currentEntry.description.en.length - excess),
      );
    }
    expect(new TextEncoder().encode(JSON.stringify(atPayloadLimit)).byteLength).toBe(65_536);
    expect(richProfileSchema.safeParse(atPayloadLimit).success).toBe(true);
    const overPayloadLimit = structuredClone(atPayloadLimit);
    overPayloadLimit.experience[9].description.en =
      overPayloadLimit.experience[9].description.en.slice(0, -1);
    overPayloadLimit.qualifications[0].description.en += 'ع';
    expect(new TextEncoder().encode(JSON.stringify(overPayloadLimit)).byteLength).toBe(65_537);
    expect(JSON.stringify(overPayloadLimit).length).toBe(65_536);
    const payloadResult = richProfileSchema.safeParse(overPayloadLimit);
    expect(payloadResult.success).toBe(false);
    if (!payloadResult.success) {
      expect(
        payloadResult.error.issues.some(issue => issue.message === 'profile_payload_too_large'),
      ).toBe(true);
      expect(
        payloadResult.error.issues.some(
          issue => issue.path.join('.') === 'experience.9.description.en',
        ),
      ).toBe(false);
    }
  });

  it('invalid_year_order_rejected', () => {
    const base = emptyRichProfile();
    const entry = {
      id: 'same',
      title: { ar: '', en: 'Title' },
      organization: { ar: '', en: 'School' },
      description: { ar: '', en: '' },
      start_year: 2022,
      end_year: 2021,
      current: false,
    };
    const cairoYear = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric' }).format(
        new Date(),
      ),
    );
    expect(
      richProfileSchema.safeParse({
        ...base,
        qualifications: [{ ...entry, start_year: 1900, end_year: cairoYear + 1 }],
      }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({
        ...base,
        qualifications: [{ ...entry, start_year: 1899, end_year: null }],
      }).success,
    ).toBe(false);
    expect(
      richProfileSchema.safeParse({
        ...base,
        qualifications: [{ ...entry, start_year: cairoYear + 2, end_year: null }],
      }).success,
    ).toBe(false);
    expect(richProfileSchema.safeParse({ ...base, experience: [entry] }).success).toBe(false);
    expect(
      richProfileSchema.safeParse({
        ...base,
        experience: [{ ...entry, end_year: null, current: true }],
      }).success,
    ).toBe(true);
  });

  it('duplicate_entry_ids_rejected_across_sections', () => {
    const base = emptyRichProfile();
    const entry = {
      id: 'same',
      title: { ar: '', en: 'Title' },
      organization: { ar: '', en: 'School' },
      description: { ar: '', en: '' },
      start_year: 2022,
      end_year: null,
      current: false,
    };
    const validEntry = { ...entry, end_year: null, current: false };
    expect(
      richProfileSchema.safeParse({
        ...base,
        experience: [validEntry, { ...validEntry, id: 'other' }],
      }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({
        ...base,
        experience: [validEntry, { ...validEntry, id: 'same' }],
      }).success,
    ).toBe(false);
    expect(
      richProfileSchema.safeParse({
        ...base,
        qualifications: [validEntry],
        experience: [{ ...validEntry, id: 'other' }],
      }).success,
    ).toBe(true);
    expect(
      richProfileSchema.safeParse({
        ...base,
        qualifications: [validEntry],
        experience: [{ ...validEntry, id: validEntry.id }],
      }).success,
    ).toBe(false);
  });

  it('uses the current Cairo year when parsing with an existing schema instance', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-12-31T21:30:00.000Z'));
      vi.resetModules();
      const { emptyRichProfile: emptyAtImport, richProfileSchema: schemaAtImport } =
        await import('@/features/teacher/profile-details-domain');
      const profile = {
        ...emptyAtImport(),
        qualifications: [
          {
            id: 'year-boundary',
            title: { ar: '', en: 'Teaching' },
            organization: { ar: '', en: '' },
            description: { ar: '', en: '' },
            start_year: 2028,
            end_year: null,
            current: false,
          },
        ],
      };
      expect(schemaAtImport.safeParse(profile).success).toBe(false);
      vi.setSystemTime(new Date('2026-12-31T22:30:00.000Z'));
      expect(schemaAtImport.safeParse(profile).success).toBe(true);
      expect(
        schemaAtImport.safeParse({
          ...profile,
          qualifications: [{ ...profile.qualifications[0], start_year: 2029 }],
        }).success,
      ).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.resetModules();
    }
  });

  it('hidden_about_omitted', () => {
    const details: RichProfileInput = {
      ...emptyRichProfile(),
      about: { ar: 'خاص', en: 'Private about' },
      approach: { ar: '', en: 'Visible approach' },
      section_order: ['about', 'approach', 'qualifications', 'experience', 'goals'],
      hidden_sections: ['about'],
    };
    expect(visibleProfileSections(details)).toEqual([
      { id: 'approach', value: { ar: '', en: 'Visible approach' } },
    ]);
    expect(JSON.stringify(visibleProfileSections(details))).not.toContain('Private about');
  });

  it('public_projection_keeps_visible_order_and_excludes_hidden_values', () => {
    const details: RichProfileInput = {
      ...emptyRichProfile(),
      about: { ar: 'خاص', en: 'Private about' },
      approach: { ar: 'نهج عربي', en: 'Visible approach' },
      goals: { ar: '', en: 'Learning goals' },
      section_order: ['approach', 'about', 'goals', 'experience', 'qualifications'],
      hidden_sections: ['about'],
    };
    const projection = visiblePublicTeacherProfile(details);
    expect(projection.sections.map(section => section.id)).toEqual(['approach', 'goals']);
    expect(JSON.stringify(projection)).not.toContain('Private about');
    expect(publicTeacherProfileDetailsSchema.safeParse(projection).success).toBe(true);
    expect(
      publicTeacherProfileDetailsSchema.safeParse({ ...projection, hidden_sections: ['about'] })
        .success,
    ).toBe(false);
  });

  it('omits blank repeater drafts while keeping partial or year-only entries visible', () => {
    const blank = {
      id: 'blank',
      title: { ar: '', en: '' },
      organization: { ar: '', en: '' },
      description: { ar: '', en: '' },
      start_year: null,
      end_year: null,
      current: false,
    };
    const partial = { ...blank, id: 'partial', title: { ar: '', en: 'Tutor' } };
    const yearOnly = { ...blank, id: 'year-only', start_year: 2020 };
    const projection = visiblePublicTeacherProfile({
      ...emptyRichProfile(),
      qualifications: [blank, partial],
      experience: [blank, yearOnly],
    });

    expect(projection.sections).toEqual([
      { id: 'qualifications', value: [partial] },
      { id: 'experience', value: [yearOnly] },
    ]);
  });

  it('public_projection_rejects_malformed_sections_and_private_fields', () => {
    const projection = visiblePublicTeacherProfile({
      ...emptyRichProfile(),
      about: { ar: '', en: 'Visible' },
    });
    expect(
      publicTeacherProfileDetailsSchema.safeParse({
        ...projection,
        sections: [{ id: 'about', value: { ar: '', en: 4 } }],
      }).success,
    ).toBe(false);
    expect(
      publicTeacherProfileDetailsSchema.safeParse({ ...projection, hidden_sections: ['goals'] })
        .success,
    ).toBe(false);
    expect(
      publicTeacherProfileDetailsSchema.safeParse({
        ...projection,
        sections: [{ id: 'untrusted', value: 'x' }],
      }).success,
    ).toBe(false);
  });
});
