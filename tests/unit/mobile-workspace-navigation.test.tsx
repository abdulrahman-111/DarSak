import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { platformNavigation } from '@/components/platform/shell';
import { mobileWorkspaceNavigation } from '@/components/mobile-nav-domain';

const mocks = vi.hoisted(() => ({ pathname: '/en/student' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));

import { MobileWorkspaceNavigation } from '@/components/mobile-workspace-navigation';

describe('mobile workspace navigation model', () => {
  it('keeps student and teacher primary links distinct from their More links', () => {
    const student = mobileWorkspaceNavigation('en', 'student', platformNavigation('en', 'student'));
    const teacher = mobileWorkspaceNavigation('en', 'teacher', platformNavigation('en', 'teacher'));
    expect(student.primary.map(item => item.label)).toEqual([
      'Home',
      'Classes',
      'Timetable',
      'Explore',
    ]);
    expect(student.secondary.map(item => item.href)).toEqual([
      '/en/student/materials',
      '/en/student/saved',
      '/en/notifications',
      '/en/account',
      '/en/reports',
    ]);
    expect(teacher.primary.map(item => item.label)).toEqual([
      'Home',
      'Groups',
      'Calendar',
      'Requests',
    ]);
    expect(teacher.secondary.map(item => item.href)).toEqual([
      '/en/teacher/students',
      '/en/teacher/catalogue',
      '/en/teacher/feedback',
      '/en/notifications',
      '/en/account',
      '/en/reports',
    ]);
  });

  it('keeps administrator links out of public workspace navigation', () => {
    for (const role of ['student', 'teacher'] as const)
      expect(platformNavigation('ar', role).some(item => item.href.includes('/admin'))).toBe(false);
  });

  it('keeps Arabic student and teacher labels localized across four primary links and More', () => {
    const student = mobileWorkspaceNavigation('ar', 'student', platformNavigation('ar', 'student'));
    const teacher = mobileWorkspaceNavigation('ar', 'teacher', platformNavigation('ar', 'teacher'));
    expect(student.primary.map(item => item.label)).toEqual([
      'الرئيسية',
      'مجموعاتي',
      'الجدول',
      'اكتشف',
    ]);
    expect(teacher.primary.map(item => item.label)).toEqual([
      'الرئيسية',
      'المجموعات',
      'الحصص',
      'الطلبات',
    ]);
    expect(student.moreLabel).toBe('المزيد');
    expect(teacher.moreLabel).toBe('المزيد');
  });
});

describe('mobile workspace navigation rendering', () => {
  beforeEach(() => {
    mocks.pathname = '/en/teacher';
  });

  it('renders a single primary bar with exact home activity and a closed More control', () => {
    const html = renderToStaticMarkup(
      <MobileWorkspaceNavigation
        locale="en"
        role="teacher"
        name="Taylor Teacher"
        unreadCount={3}
        items={platformNavigation('en', 'teacher')}
      />,
    );
    expect(html).toContain('data-mobile-workspace-nav="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="mobile-workspace-more"');
    expect(html).toContain('Home');
    expect(html).toContain('Calendar');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="page"');
  });

  it('marks booking routes as their primary calendar and recommendations as Explore on desktop/mobile models', () => {
    const student = mobileWorkspaceNavigation('en', 'student', platformNavigation('en', 'student'));
    const teacher = mobileWorkspaceNavigation('en', 'teacher', platformNavigation('en', 'teacher'));
    expect(student.primary.find(item => item.href === '/en/timetable')?.activePaths).toContain(
      '/en/student/bookings',
    );
    expect(student.primary.find(item => item.href === '/en/teachers')?.activePaths).toContain(
      '/en/student/recommendations',
    );
    expect(
      teacher.primary.find(item => item.href === '/en/teacher/lessons')?.activePaths,
    ).toContain('/en/teacher/bookings');

    mocks.pathname = '/en/student/recommendations';
    const recommendations = renderToStaticMarkup(
      <MobileWorkspaceNavigation
        locale="en"
        role="student"
        name="Student"
        unreadCount={null}
        items={platformNavigation('en', 'student')}
      />,
    );
    expect(recommendations).toContain(
      'href="/en/teachers" aria-label="Explore" aria-current="page"',
    );
    expect(recommendations).not.toContain('href="/en/student/recommendations"');

    mocks.pathname = '/en/student/bookings';
    const bookings = renderToStaticMarkup(
      <MobileWorkspaceNavigation
        locale="en"
        role="student"
        name="Student"
        unreadCount={null}
        items={platformNavigation('en', 'student')}
      />,
    );
    expect(bookings).toContain('href="/en/timetable" aria-label="Timetable" aria-current="page"');
    expect(bookings).not.toContain('href="/en/student/bookings"');
  });
});
