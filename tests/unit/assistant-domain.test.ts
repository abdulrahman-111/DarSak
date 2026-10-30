import { describe, expect, it } from 'vitest';
import {
  buildPreviewDraft,
  generatedGroupDraftSchema,
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

  it('accepts harmless Arabic text and ordinary newlines in generated fields', () => {
    const draft = {
      name: 'أساسيات الجبر',
      description: 'مقدمة مناسبة للمبتدئين.\nنراجع الأمثلة خطوة بخطوة.',
      outcomes: 'حل معادلات بسيطة',
      prerequisites: 'لا توجد متطلبات مسبقة.',
    };
    expect(groupDraftSchema.safeParse(draft).success).toBe(true);
    expect(generatedGroupDraftSchema.safeParse(draft).success).toBe(true);
    expect(generatedGroupDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('preserves ordinary programming, math, and Arabic direction marks', () => {
    const draft = {
      name: 'أساسيات البرمجة',
      description: 'استخدم Array.map و Math.sqrt في الأمثلة.\nالناتج هو 2.5، وهذا واضح.',
      outcomes: 'فهم ترتيب العمليات الحسابية.',
      prerequisites: 'علامات اتجاه عربية: \u061C\u200E\u200F',
    };
    expect(groupDraftSchema.safeParse(draft).success).toBe(true);
  });

  it('does not treat ordinary numeric sequences or IPv4 addresses as contact details', () => {
    const draft = {
      name: 'Number patterns',
      description: 'Count 1 2 3 4 5 6 7 8 9 10. Use the address 192.168.1.1 in the example.',
      outcomes: 'Recognize examples.',
      prerequisites: '',
    };
    expect(groupDraftSchema.safeParse(draft).success).toBe(true);
  });

  it.each([
    'Subtract 10000 - 20000',
    'Sequence 1-2-3-4-5-6-7-8-9-10',
    'Explain Python decorator @staticmethod',
  ])('keeps ordinary study text %s valid in generated drafts and local templates', topic => {
    const draft = buildPreviewDraft(groupDraftInputSchema.parse({ ...valid, topic }));
    expect(groupDraftSchema.parse(draft)).toEqual(draft);
    expect(generatedGroupDraftSchema.parse(draft)).toEqual(draft);
  });

  it.each([
    ['control character', 'مقدمة\u0000 ضارة'],
    ['bidi override', 'مقدمة\u202Eضارة'],
    ['bidi isolate', 'مقدمة\u2068ضارة\u2069'],
    ['URL', 'راجع https://example.invalid/course'],
    ['email', 'تواصل عبر learner@example.invalid'],
  ])('rejects unsafe generated content containing %s', (_label, value) => {
    expect(
      generatedGroupDraftSchema.safeParse({
        name: 'الجبر',
        description: value,
        outcomes: 'حل معادلات بسيطة',
        prerequisites: '',
      }).success,
    ).toBe(false);
  });
});
