import { describe, expect, it } from 'vitest';
import {
  canSelectCatalogueRow,
  catalogueDisplayName,
  catalogueLabelSchema,
  teacherCategorySchema,
} from '@/features/teacher/catalogue-domain';

describe('teacher catalogue labels', () => {
  it('trims each language and accepts a label present in only one language', () => {
    expect(catalogueLabelSchema.parse({ name_ar: '  رياضيات  ', name_en: '   ' })).toEqual({
      name_ar: 'رياضيات',
      name_en: '',
    });
    expect(catalogueLabelSchema.parse({ name_ar: '\t ', name_en: '  Algebra  ' })).toEqual({
      name_ar: '',
      name_en: 'Algebra',
    });
  });

  it('rejects both-empty names and reports that cross-field error on name_ar', () => {
    const result = catalogueLabelSchema.safeParse({ name_ar: '  ', name_en: '\n' });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map(issue => issue.path)).toContainEqual(['name_ar']);
  });

  it('accepts exactly 120 trimmed characters per language and rejects 121', () => {
    const atLimit = 'x'.repeat(120);
    expect(catalogueLabelSchema.safeParse({ name_ar: atLimit, name_en: atLimit }).success).toBe(
      true,
    );
    expect(catalogueLabelSchema.safeParse({ name_ar: `${atLimit}x`, name_en: '' }).success).toBe(
      false,
    );
  });

  it('accepts only the custom teacher category kinds', () => {
    const labels = { name_ar: '  سنة أولى ', name_en: ' Year one ' };
    expect(teacherCategorySchema.parse({ ...labels, kind: 'custom_year' })).toEqual({
      name_ar: 'سنة أولى',
      name_en: 'Year one',
      kind: 'custom_year',
    });
    expect(teacherCategorySchema.safeParse({ ...labels, kind: 'student_category' }).success).toBe(
      true,
    );
    expect(teacherCategorySchema.safeParse({ ...labels, kind: 'subject' }).success).toBe(false);
  });

  it('displays the requested trimmed language and falls back to the other language', () => {
    const row = { name_ar: '  جبر ', name_en: ' Algebra  ' };
    expect(catalogueDisplayName(row, 'ar')).toBe('جبر');
    expect(catalogueDisplayName(row, 'en')).toBe('Algebra');
    expect(catalogueDisplayName({ name_ar: '   ', name_en: ' Algebra ' }, 'ar')).toBe('Algebra');
    expect(catalogueDisplayName({ name_ar: ' جبر ', name_en: ' ' }, 'en')).toBe('جبر');
    expect(catalogueDisplayName({ name_ar: ' ', name_en: ' ' }, 'en')).toBe('');
  });

  it('allows identical display labels for distinct teacher records', () => {
    const labelA = { name_ar: 'رياضيات', name_en: 'Math' };
    const labelB = { name_ar: ' رياضيات ', name_en: ' Math ' };
    expect(catalogueLabelSchema.parse(labelA)).toEqual(catalogueLabelSchema.parse(labelB));
    expect(
      canSelectCatalogueRow(
        { id: 'a', owner_teacher_id: 'teacher-a', archived_at: null },
        'teacher-a',
      ),
    ).toBe(true);
    expect(
      canSelectCatalogueRow(
        { id: 'b', owner_teacher_id: 'teacher-b', archived_at: null },
        'teacher-a',
      ),
    ).toBe(false);
  });
});

describe('catalogue row selection', () => {
  const teacherId = 'teacher-a';
  const rows = [
    {
      name: 'shared active',
      row: { id: 'shared-active', owner_teacher_id: null, archived_at: null },
    },
    {
      name: 'shared archived',
      row: { id: 'shared-archived', owner_teacher_id: null, archived_at: '2026-01-01' },
    },
    {
      name: 'own active',
      row: { id: 'own-active', owner_teacher_id: teacherId, archived_at: null },
    },
    {
      name: 'own archived',
      row: { id: 'own-archived', owner_teacher_id: teacherId, archived_at: '2026-01-01' },
    },
    {
      name: 'foreign active',
      row: { id: 'foreign-active', owner_teacher_id: 'teacher-b', archived_at: null },
    },
    {
      name: 'foreign archived',
      row: { id: 'foreign-archived', owner_teacher_id: 'teacher-b', archived_at: '2026-01-01' },
    },
  ];

  it.each(rows)('checks both owner and archive state for $name', ({ row }) => {
    expect(canSelectCatalogueRow(row, teacherId)).toBe(
      row.owner_teacher_id !== 'teacher-b' && row.archived_at === null,
    );
  });

  it('allows an archived shared or own row only when its ID is retained', () => {
    expect(canSelectCatalogueRow(rows[1].row, teacherId, 'shared-archived')).toBe(true);
    expect(canSelectCatalogueRow(rows[1].row, teacherId, 'another-id')).toBe(false);
    expect(canSelectCatalogueRow(rows[3].row, teacherId, 'own-archived')).toBe(true);
    expect(canSelectCatalogueRow(rows[3].row, teacherId, 'another-id')).toBe(false);
  });

  it('does not let a retained ID make a foreign row selectable', () => {
    expect(canSelectCatalogueRow(rows[4].row, teacherId, 'foreign-active')).toBe(false);
    expect(canSelectCatalogueRow(rows[5].row, teacherId, 'foreign-archived')).toBe(false);
  });

  it('requires explicit ownership and archive values', () => {
    expect(
      canSelectCatalogueRow({ id: 'missing-owner', archived_at: null } as never, teacherId),
    ).toBe(false);
    expect(
      canSelectCatalogueRow({ id: 'missing-archive', owner_teacher_id: null } as never, teacherId),
    ).toBe(false);
  });
});
