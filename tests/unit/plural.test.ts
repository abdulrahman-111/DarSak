import { describe, expect, it } from 'vitest';
import { pluralize } from '@/lib/plural';

const groups = {
  zero: 'لا توجد مجموعات مسجل بها',
  one: 'مجموعة واحدة مسجل بها',
  two: 'مجموعتان مسجل بهما',
  few: '{n} مجموعات مسجل بها',
  other: '{n} مجموعة مسجل بها',
};

describe('pluralize', () => {
  it('uses Arabic plural categories', () => {
    expect(pluralize('ar', 0, groups)).toBe('لا توجد مجموعات مسجل بها');
    expect(pluralize('ar', 1, groups)).toBe('مجموعة واحدة مسجل بها');
    expect(pluralize('ar', 2, groups)).toBe('مجموعتان مسجل بهما');
    expect(pluralize('ar', 3, groups)).toBe('3 مجموعات مسجل بها');
    expect(pluralize('ar', 10, groups)).toBe('10 مجموعات مسجل بها');
    expect(pluralize('ar', 11, groups)).toBe('11 مجموعة مسجل بها');
    expect(pluralize('ar', 100, groups)).toBe('100 مجموعة مسجل بها');
  });

  it('falls back to other when a category is not supplied', () => {
    expect(pluralize('ar', 11, { few: '{n} طلبات', other: '{n} طلب' })).toBe('11 طلب');
  });

  it('uses English one/other', () => {
    const forms = { one: '{n} enrolled class', other: '{n} enrolled classes' };
    expect(pluralize('en', 0, forms)).toBe('0 enrolled classes');
    expect(pluralize('en', 1, forms)).toBe('1 enrolled class');
    expect(pluralize('en', 2, forms)).toBe('2 enrolled classes');
  });
});
