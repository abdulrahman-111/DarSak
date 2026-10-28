import { describe, expect, it } from 'vitest';
import {
  buildPreviewDraft,
  groupDraftInputSchema,
  groupDraftSchema,
} from '@/features/assistant/domain';

const valid = {
  locale: 'en',
  topic: 'Algebra basics',
  level: 'beginner',
  format: 'online',
  guidance: '',
} as const;

describe('assistant local preview domain', () => {
  it('trims and strictly validates the bounded input contract', () => {
    expect(
      groupDraftInputSchema.parse({
        ...valid,
        topic: '  Algebra  ',
        guidance: '  Bring examples.  ',
      }),
    ).toEqual({
      ...valid,
      topic: 'Algebra',
      guidance: 'Bring examples.',
    });
    expect(groupDraftInputSchema.safeParse({ ...valid, locale: 'fr' }).success).toBe(false);
    expect(groupDraftInputSchema.safeParse({ ...valid, surprise: true }).success).toBe(false);
    expect(groupDraftInputSchema.safeParse({ ...valid, topic: 'x'.repeat(121) }).success).toBe(
      false,
    );
    expect(groupDraftInputSchema.safeParse({ ...valid, topic: ' x ' }).success).toBe(false);
    expect(groupDraftInputSchema.safeParse({ ...valid, guidance: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('returns a deterministic schema-valid English template without invented logistics', () => {
    const input = groupDraftInputSchema.parse({ ...valid, guidance: 'Use everyday examples' });
    const draft = buildPreviewDraft(input);
    expect(groupDraftSchema.parse(draft)).toEqual(draft);
    expect(buildPreviewDraft(input)).toEqual(draft);
    expect(draft.name).toContain('Algebra');
    expect(draft.description).toContain('online');
    expect(draft.prerequisites).toContain('Use everyday examples');
    expect(draft.outcomes.length).toBeGreaterThan(0);
    expect(draft.prerequisites.length).toBeGreaterThan(0);
    expect(
      `${draft.name} ${draft.description} ${draft.outcomes} ${draft.prerequisites}`,
    ).not.toMatch(/\b(?:EGP|USD|price|fee|per week|every Monday|certified|guarantee)\b/i);
  });

  it('varies templates for Arabic and the selected level and format', () => {
    const english = buildPreviewDraft(groupDraftInputSchema.parse(valid));
    const arabic = buildPreviewDraft(
      groupDraftInputSchema.parse({
        locale: 'ar',
        topic: 'أساسيات الجبر',
        level: 'advanced',
        format: 'hybrid',
        guidance: '',
      }),
    );
    expect(arabic.name).toContain('أساسيات الجبر');
    expect(arabic.description).toMatch(/هجين/);
    expect(arabic.description).toMatch(/متقدم/);
    expect(arabic.description).not.toEqual(english.description);
  });

  it('keeps the preview name valid when the topic reaches its input limit', () => {
    const input = groupDraftInputSchema.parse({ ...valid, topic: 'A'.repeat(120) });
    expect(groupDraftSchema.safeParse(buildPreviewDraft(input)).success).toBe(true);
  });
});
