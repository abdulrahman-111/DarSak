import { describe, expect, it } from 'vitest';
import { teacherSubscriptionNoticeCopy } from '@/features/teacher-access/subscription-notice';

describe('teacher subscription notice', () => {
  it('states the free launch end date and future monthly and semester options', () => {
    const copy = teacherSubscriptionNoticeCopy('en');
    expect(copy.free).toBe('The free launch runs through 14 November 2026.');
    expect(copy.free).not.toMatch(/first month/i);
    expect(copy.plans).toMatch(/monthly and semester subscriptions will be available/i);
    expect(copy.details).toMatch(/announce prices, semester length, and payment details before any paid subscription is activated/i);
    expect(`${copy.free} ${copy.plans} ${copy.details}`).not.toMatch(/\$|\b\d+\s*(?:days?|weeks?|months?)\b|first month/i);
  });

  it('provides the same notice in Arabic', () => {
    const copy = teacherSubscriptionNoticeCopy('ar');
    expect(copy.free).toBe('تستمر الفترة المجانية حتى نهاية يوم ١٤ نوفمبر ٢٠٢٦.');
    expect(copy.free).not.toContain('الشهر الأول');
    expect(copy.plans).toContain('اشتراكات شهرية وفصلية');
    expect(copy.details).toContain('قبل تفعيل أي اشتراك مدفوع');
  });
});
