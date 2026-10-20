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

  it('keeps admin reports and people in the primary row and other admin destinations in More', () => {
    const admin = mobileWorkspaceNavigation('ar', 'admin', platformNavigation('ar', 'admin'));
    expect(admin.primary.map(item => item.href)).toEqual([
      '/ar/admin',
      '/ar/admin/teachers',
      '/ar/admin/reports',
      '/ar/admin/users',
    ]);
    expect(admin.secondary.map(item => item.href)).toContain('/ar/admin/settings');
    expect(admin.secondary.map(item => item.href)).toContain('/ar/notifications');
    expect(admin.moreLabel).toBe('المزيد');
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

  it('marks only the nested primary route active instead of Home', () => {
    mocks.pathname = '/ar/admin/teachers/abc';
    const html = renderToStaticMarkup(
      <MobileWorkspaceNavigation
        locale="ar"
        role="admin"
        name="مسؤول"
        unreadCount={null}
        items={platformNavigation('ar', 'admin')}
      />,
    );
    expect(html).toContain('href="/ar/admin/teachers" aria-label="المعلمون" aria-current="page"');
    expect(html).not.toContain('href="/ar/admin" aria-label="الرئيسية" aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
