import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GroupDraftPanel } from '@/features/assistant/group-draft-panel';
import { applyDraftTextToFormValues } from '@/features/teacher/setup-forms';

vi.mock('server-only', () => ({}));

const draft = {
  name: 'Fractions for beginners',
  description: 'A reviewed outline',
  outcomes: 'Compare fractions',
  prerequisites: 'Basic arithmetic',
};

describe('teacher group template preview', () => {
  it('renders an honest local preview with keyboard-safe form controls', () => {
    const html = renderToStaticMarkup(<GroupDraftPanel locale="en" onApply={() => undefined} />);
    expect(html).toContain('The local template option uses authored text, not AI');
    expect(html).toContain('Nothing is saved until you save the group form');
    expect(html).toContain('Create template preview');
    expect(html).toContain('Generate with SanDak');
    expect(html).toContain('Local group template');
    expect(html).toContain('id="group-template-topic"');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="submit"');
  });

  it('keeps local drafting explicitly labeled and does not nest or submit the parent form', () => {
    const html = renderToStaticMarkup(<GroupDraftPanel locale="ar" onApply={() => undefined} />);
    expect(html).toContain('خيار القالب المحلي يستخدم نصًا مُعدًا مسبقًا');
    expect(html).toContain('إنشاء بمساعدة سندك');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="submit"');
  });

  it('replaces exactly the four draft text values while preserving setup tokens and other values', () => {
    const formValues = {
      name: 'Typed name',
      description: 'Typed description',
      subject_id: 'subject-id',
      category_id: 'category-id',
      capacity: 12,
      location: 'Nasr City',
      updated_at: 'group-version',
    };
    const learningValues = {
      outcomes: 'Typed outcomes',
      prerequisites: 'Typed prerequisites',
      delivery_mode: 'hybrid' as const,
      fee_egp: 825,
      fee_basis: 'month' as const,
      fee_includes: 'Lessons and worksheets',
    };

    expect(applyDraftTextToFormValues(formValues, learningValues, draft)).toEqual({
      formValues: { ...formValues, name: draft.name, description: draft.description },
      learningValues: {
        ...learningValues,
        outcomes: draft.outcomes,
        prerequisites: draft.prerequisites,
      },
    });
  });
});
