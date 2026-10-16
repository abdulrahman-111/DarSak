import { describe, expect, it } from 'vitest';
import { teacherSubscriptionNoticeCopy } from '@/features/teacher-access/subscription-notice';

describe('teacher subscription notice', () => {
  it('states the free first month and future monthly and semester options without invented terms', () => {
    const copy = teacherSubscriptionNoticeCopy('en');
    expect(copy.free).toMatch(/first month is completely free/i);
    expect(copy.plans).toMatch(/monthly and semester subscriptions will be available/i);
    expect(copy.details).toMatch(/announce prices, semester length, and payment details before any paid subscription is activated/i);
    expect(`${copy.free} ${copy.plans} ${copy.details}`).not.toMatch(/\$|\b\d+\s*(?:days?|weeks?|months?)\b/i);
  });

  it('provides the same notice in Arabic', () => {
    const copy = teacherSubscriptionNoticeCopy('ar');
    expect(copy.free).toContain('الشهر الأول مجاني بالكامل');
    expect(copy.plans).toContain('اشتراكات شهرية وفصلية');
    expect(copy.details).toContain('قبل تفعيل أي اشتراك مدفوع');
  });
});
