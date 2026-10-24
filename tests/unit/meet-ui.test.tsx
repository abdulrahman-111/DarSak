import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GoogleMeetAccountView,
  StudentMeetingCard,
  TeacherMeetingCard,
  safeMeetingUrl,
} from '@/features/meet/views';
import type { LessonMeeting } from '@/features/meet/data';

const meeting: LessonMeeting = {
  mode: 'automatic',
  status: 'ready',
  join_url: 'https://meet.google.com/abc-defg-hij',
  error_code: null,
};

describe('Google Meet UI safety', () => {
  it('accepts credential-free HTTPS meeting links only', () => {
    expect(safeMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
    expect(safeMeetingUrl('javascript:alert(1)')).toBeNull();
    expect(safeMeetingUrl('https://user:pass@example.test/meeting')).toBeNull();
    expect(safeMeetingUrl('http://meet.google.com/abc-defg-hij')).toBeNull();
  });

  it('shows an accepted student a safe ready link and omits it after cancellation', () => {
    const ready = renderToStaticMarkup(
      createElement(StudentMeetingCard, { locale: 'en', meeting }),
    );
    expect(ready).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(ready).toContain('Join lesson meeting');

    const cancelled = renderToStaticMarkup(
      createElement(StudentMeetingCard, {
        locale: 'en',
        meeting: { ...meeting, status: 'cancelled' },
      }),
    );
    expect(cancelled).not.toContain('href=');
    expect(cancelled).toContain('Cancelled');
  });

  it('does not offer Google connection controls while the feature is disabled', () => {
    const html = renderToStaticMarkup(
      createElement(GoogleMeetAccountView, {
        locale: 'en',
        enabled: false,
        oauthEnabled: false,
        status: null,
      }),
    );
    expect(html).toContain('not available');
    expect(html).not.toContain('Connect Google');
  });

  it('keeps lesson management controls on the teacher view only', () => {
    const teacher = renderToStaticMarkup(
      createElement(TeacherMeetingCard, {
        locale: 'en',
        lessonId: 'lesson-id',
        meeting: { ...meeting, status: 'unprepared', join_url: null },
        enabled: true,
        oauthEnabled: true,
        canManage: true,
      }),
    );
    const student = renderToStaticMarkup(
      createElement(StudentMeetingCard, {
        locale: 'en',
        meeting: { ...meeting, status: 'unprepared', join_url: null },
      }),
    );
    expect(teacher).toContain('Prepare meeting link');
    expect(teacher).toContain('Manual meeting link');
    expect(student).not.toContain('Prepare meeting link');
    expect(student).not.toContain('Manual meeting link');
  });

  it('keeps Google connect hidden in manual-only staging mode', () => {
    const html = renderToStaticMarkup(
      createElement(GoogleMeetAccountView, {
        locale: 'en',
        enabled: true,
        oauthEnabled: false,
        status: {
          state: 'disconnected',
          email: null,
          pending_count: 0,
          failed_count: 0,
          unprepared_count: 0,
        },
      }),
    );
    expect(html).toContain('Automatic Google connection is not configured');
    expect(html).not.toContain('Connect Google');
  });

  it('renders the free personal-account limits in English and Arabic', () => {
    const status = {
      state: 'disconnected' as const,
      email: null,
      pending_count: 0,
      failed_count: 0,
      unprepared_count: 0,
    };
    const english = renderToStaticMarkup(
      createElement(GoogleMeetAccountView, {
        locale: 'en',
        enabled: true,
        oauthEnabled: false,
        status,
      }),
    );
    const arabic = renderToStaticMarkup(
      createElement(GoogleMeetAccountView, {
        locale: 'ar',
        enabled: true,
        oauthEnabled: false,
        status,
      }),
    );
    expect(english).toContain('up to 100 participants');
    expect(english).toContain('3 or more participants are limited to 60 minutes');
    expect(english).toContain('does not upgrade your Google plan');
    expect(arabic).toContain('100 مشارك');
    expect(arabic).toContain('3 مشاركين أو أكثر');
    expect(arabic).toContain('60 دقيقة');
    expect(arabic).toContain('لا يغيّر خطة Google');
  });
});
