import { describe, expect, it } from 'vitest';
import { pricingCopy } from '@/features/subscriptions/pricing-copy';

describe('localized pricing copy', () => {
  it('provides availability and lesson-fee details in both locales', () => {
    expect(pricingCopy('en').availability).toContain('Upcoming plan');
    expect(pricingCopy('en').common).toContain('agree lesson fees directly with their teacher');
    expect(pricingCopy('en').quota).toContain('External links and notes do not count');
    expect(pricingCopy('ar').availability).toContain('غير متاحة حالياً');
    expect(pricingCopy('ar').common).toContain('مباشرة مع المعلم');
    expect(pricingCopy('ar').quota).toContain('الروابط والملاحظات الخارجية لا تحتسب');
    expect(pricingCopy('en').paymentTitle).toContain('Ready to organize your teaching');
    expect(pricingCopy('en').payment).toContain('Create your teacher profile');
    expect(pricingCopy('ar').paymentTitle).toContain('مستعد لتنظيم عملك التعليمي');
    expect(pricingCopy('ar').payment).toContain('أنشئ ملفك كمعلم');
    expect(`${pricingCopy('en').paymentTitle} ${pricingCopy('en').payment} ${pricingCopy('ar').paymentTitle} ${pricingCopy('ar').payment}`).not.toMatch(/payment|fee|support|transfer|receipt|bank|WhatsApp|دفع|رسوم|دعم|تحويل|إيصال|بنك|واتساب/i);
  });
});
