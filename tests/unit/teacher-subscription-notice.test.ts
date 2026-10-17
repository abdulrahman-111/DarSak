import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { teacherSubscriptionNoticeCopy } from '@/features/teacher-access/subscription-notice';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';

describe('teacher subscription notice', () => {
  it('states the free launch end date, upcoming monthly prices, and no activation now', () => {
    const copy = teacherSubscriptionNoticeCopy('en');
    expect(copy.free).toBe('The free launch runs through 14 November 2026.');
    expect(copy.free).not.toMatch(/first month/i);
    expect(copy.plans).toMatch(/Standard at EGP 100\/month and Pro at EGP 200\/month/i);
    expect(copy.details).toBe('Paid plans start no earlier than 15 November 2026. Your account is free during the launch phase.');
    expect(copy.support).toBe('Our support team will contact you to complete registration and explain the plan options before paid subscriptions begin.');
    expect(`${copy.free} ${copy.plans} ${copy.details} ${copy.support}`).not.toContain('There is no payment through this website.');
    expect(`${copy.free} ${copy.plans} ${copy.details}`).not.toMatch(/\$|semester|first month/i);
  });

  it('provides the same notice in Arabic', () => {
    const copy = teacherSubscriptionNoticeCopy('ar');
    expect(copy.free).toBe('تستمر الفترة المجانية حتى نهاية يوم ١٤ نوفمبر ٢٠٢٦.');
    expect(copy.free).not.toContain('الشهر الأول');
    expect(copy.plans).toContain('ستاندرد 100 جنيه شهرياً وبرو 200 جنيه شهرياً');
    expect(copy.details).toBe('لن تبدأ الخطط المدفوعة قبل ١٥ نوفمبر ٢٠٢٦. حسابك مجاني خلال مرحلة الإطلاق.');
    expect(copy.support).toMatch(/سيتواصل معك فريق الدعم/);
    expect(`${copy.free} ${copy.plans} ${copy.details} ${copy.support}`).not.toContain('لا يتم الدفع عبر هذا الموقع');
  });

  it('keeps the support and subscription-fee contact note off public signup by default', () => {
    const publicMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en' }));
    const signedInMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en', signedInTeacher: true }));
    const compactMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en', signedInTeacher: true, compact: true }));
    const compactArabicMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'ar', signedInTeacher: true, compact: true }));
    expect(publicMarkup).not.toContain('Our support team will contact you');
    expect(publicMarkup).not.toContain('explain the plan options');
    expect(signedInMarkup).toContain('EGP 100/month');
    expect(signedInMarkup).toContain('Our support team will contact you to complete registration');
    expect(compactMarkup).toContain('14 November 2026');
    expect(compactMarkup).toContain('Manage plan');
    expect(compactMarkup).toContain('/en/account/teaching-access');
    expect(compactMarkup).not.toContain('EGP 100');
    expect(compactMarkup).not.toContain('support team');
    expect(compactMarkup).not.toContain('plan options');
    expect(compactArabicMarkup).toContain('١٤ نوفمبر ٢٠٢٦');
    expect(compactArabicMarkup).toContain('إدارة الخطة');
    expect(compactArabicMarkup).not.toContain('100 جنيه');
    expect(compactArabicMarkup).not.toContain('فريق الدعم');
  });
});
