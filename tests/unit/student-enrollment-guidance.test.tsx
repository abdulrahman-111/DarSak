import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { whatsappGroupMessageUrl } from '@/features/student/enrollment-guidance-domain';
import { StudentTeacherContactCard } from '@/features/student/teacher-contact-card';
import { EnrollmentProgress } from '@/features/student/enrollment-progress';

describe('student enrollment guidance', () => {
  it('builds a localized WhatsApp message with the class name safely encoded', () => {
    expect(whatsappGroupMessageUrl('https://wa.me/201234567890', 'Math & Science', 'en')).toBe(
      'https://wa.me/201234567890?text=Hello%2C%20I%20joined%20Math%20%26%20Science%20on%20DarSak.%20What%20should%20I%20prepare%20for%20our%20first%20lesson%3F',
    );
    expect(whatsappGroupMessageUrl('https://wa.me/201234567890', 'رياضيات', 'ar')).toContain(
      encodeURIComponent(
        'مرحبًا، انضممت إلى مجموعة رياضيات على درسك. ما الذي ينبغي أن أستعد له لحصتنا الأولى؟',
      ),
    );
  });

  it('shows a prominent accepted-student contact card and respects teacher availability', () => {
    const card = renderToStaticMarkup(
      createElement(StudentTeacherContactCard, {
        locale: 'en',
        groupName: 'Math & Science',
        teacherName: 'Mona Salem',
        teacherHeadline: 'Mathematics teacher',
        teacherAvailable: true,
        contacts: {
          phone_number: '+201234567890',
          whatsapp_number: '+201234567890',
          contact_email: 'mona@example.com',
        },
        welcome: true,
      }),
    );
    expect(card).toContain('id="teacher-contact"');
    expect(card).toContain('You&#x27;re accepted! Contact your teacher to confirm arrangements.');
    expect(card).toContain('https://wa.me/201234567890?text=');
    expect(card).toContain('href="tel:+201234567890"');
    expect(card).toContain('href="mailto:mona@example.com"');

    const unavailable = renderToStaticMarkup(
      createElement(StudentTeacherContactCard, {
        locale: 'en',
        groupName: 'Math & Science',
        teacherName: 'Mona Salem',
        teacherHeadline: '',
        teacherAvailable: false,
        contacts: {
          phone_number: '+201234567890',
          whatsapp_number: '+201234567890',
          contact_email: 'mona@example.com',
        },
      }),
    );
    expect(unavailable).toBe('');
  });

  it('provides a useful fallback when the teacher has no shared contact channels', () => {
    const markup = renderToStaticMarkup(
      createElement(StudentTeacherContactCard, {
        locale: 'ar',
        groupName: 'الرياضيات',
        teacherName: 'منى سالم',
        teacherHeadline: '',
        teacherAvailable: true,
        contacts: null,
      }),
    );
    expect(markup).toContain('لم يضف المعلم بيانات تواصل متاحة بعد');
    expect(markup).not.toContain('wa.me');
  });

  it('keeps teacher contact as a future step after acceptance', () => {
    const markup = renderToStaticMarkup(
      createElement(EnrollmentProgress, { locale: 'en', current: 'accepted' }),
    );
    expect(markup).toContain('Accepted');
    expect(markup).toContain('Complete');
    expect(markup).toContain('Contact teacher');
    expect(markup).toContain('Up next');
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain(
      '<span class="block text-[10px] uppercase tracking-wide opacity-75">Up next</span><span class="mt-1 block wrap-break-word">Contact teacher',
    );
  });

  it('marks the request as current while teacher review and contact are upcoming', () => {
    const markup = renderToStaticMarkup(
      createElement(EnrollmentProgress, { locale: 'en', current: 'requested' }),
    );
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain('Request sent');
    expect(markup).toContain('Accepted');
    expect(markup).toContain('Contact teacher');
    expect(markup.match(/Up next/g)).toHaveLength(2);
  });
});
