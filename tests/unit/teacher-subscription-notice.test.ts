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
    expect(copy.details).toMatch(/earliest paid-plan start is 15 November 2026/i);
    expect(copy.details).toMatch(/no payment will be collected/i);
    expect(copy.support).toMatch(/a member of support will contact you to complete registration/i);
    expect(copy.support).toMatch(/there is no payment through this website/i);
    expect(`${copy.free} ${copy.plans} ${copy.details}`).not.toMatch(/\$|semester|first month/i);
  });

  it('provides the same notice in Arabic', () => {
    const copy = teacherSubscriptionNoticeCopy('ar');
    expect(copy.free).toBe('تستمر الفترة المجانية حتى نهاية يوم ١٤ نوفمبر ٢٠٢٦.');
    expect(copy.free).not.toContain('الشهر الأول');
    expect(copy.plans).toContain('ستاندرد 100 جنيه شهرياً وبرو 200 جنيه شهرياً');
    expect(copy.details).toContain('لا يوجد تحصيل أو تفعيل اشتراك الآن');
    expect(copy.support).toMatch(/سيتواصل معك أحد أعضاء فريق الدعم/);
  });

  it('keeps the support and subscription-fee contact note off public signup by default', () => {
    const publicMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en' }));
    const signedInMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en', signedInTeacher: true }));
    expect(publicMarkup).not.toContain('A member of support will contact you');
    expect(publicMarkup).not.toContain('arrange subscription fees with you directly');
    expect(signedInMarkup).toContain('A member of support will contact you to complete registration');
    expect(signedInMarkup).toContain('There is no payment through this website');
  });
});
