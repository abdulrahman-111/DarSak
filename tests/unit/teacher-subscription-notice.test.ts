import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { teacherSubscriptionNoticeCopy } from '@/features/teacher-access/subscription-notice';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';

describe('teacher subscription notice', () => {
  it('states free access through next semester without promoting prices or a cutoff date', () => {
    const copy = teacherSubscriptionNoticeCopy('en');
    expect(copy.free).toBe('The platform is free until next semester. We will announce paid plans before they begin.');
    expect(copy.free).not.toMatch(/first month/i);
    expect(copy.details).toBe('There are no subscription fees during the free launch.');
    expect(`${copy.free} ${copy.details}`).not.toMatch(/\$|November|2026|price|EGP|جنيه/i);
  });

  it('provides the same notice in Arabic', () => {
    const copy = teacherSubscriptionNoticeCopy('ar');
    expect(copy.free).toBe('المنصة مجانية حتى الفصل الدراسي القادم. سنعلن عن الخطط المدفوعة قبل بدء تطبيقها.');
    expect(copy.free).not.toContain('الشهر الأول');
    expect(copy.details).toBe('لا توجد رسوم اشتراك خلال الفترة المجانية.');
    expect(copy.support).toMatch(/سيتواصل معك فريق الدعم/);
    expect(`${copy.free} ${copy.details} ${copy.support}`).not.toMatch(/نوفمبر|٢٠٢٦|جنيه|أسعار/);
  });

  it('keeps the support and subscription-fee contact note off public signup by default', () => {
    const publicMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en' }));
    const signedInMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en', signedInTeacher: true }));
    const compactMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'en', signedInTeacher: true, compact: true }));
    const compactArabicMarkup = renderToStaticMarkup(createElement(TeacherSubscriptionNotice, { locale: 'ar', signedInTeacher: true, compact: true }));
    expect(publicMarkup).not.toContain('Our support team will contact you');
    expect(publicMarkup).not.toContain('explain the plan options');
    expect(signedInMarkup).toContain('There are no subscription fees during the free launch.');
    expect(signedInMarkup).not.toMatch(/EGP|100|200|pricing/i);
    expect(signedInMarkup).toContain('Our support team will contact you to complete registration');
    expect(compactMarkup).toContain('next semester');
    expect(compactMarkup).toContain('Manage plan');
    expect(compactMarkup).toContain('/en/account/teaching-access');
    expect(compactMarkup).not.toContain('EGP 100');
    expect(compactMarkup).not.toContain('support team');
    expect(compactMarkup).not.toContain('plan options');
    expect(compactArabicMarkup).toContain('الفصل الدراسي القادم');
    expect(compactArabicMarkup).toContain('إدارة الخطة');
    expect(compactArabicMarkup).not.toContain('100 جنيه');
    expect(compactArabicMarkup).not.toContain('فريق الدعم');
  });
});
