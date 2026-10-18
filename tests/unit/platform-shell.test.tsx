import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: '/en/teacher' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/components/active-link', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/active-link')>();
  return {
    ...actual,
    ActiveLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
      createElement('a', { href, className }, children),
  };
});

import { PlatformShell } from '@/components/platform/shell';

describe('role navigation shell', () => {
  it('renders a compact keyboard-accessible mobile menu and keeps the desktop links visible', () => {
    const html = renderToStaticMarkup(
      <PlatformShell locale="en" role="teacher" name="A Very Long Teacher Name">
        <main>Dashboard</main>
      </PlatformShell>,
    );

    expect(html).toContain('<details class="group lg:hidden">');
    expect(html).toContain('<summary');
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('Teacher workspace · Teaching home');
    expect(html).toContain('A Very Long Teacher Name');
    expect(html).toContain('class="mt-5 hidden gap-2 pb-2 lg:grid"');
    expect(html).toContain('aria-label="Teacher navigation"');
  });

  it('shows the active nested page in the compact menu for each role and locale', () => {
    mocks.pathname = '/en/teacher/groups';
    const teacher = renderToStaticMarkup(<PlatformShell locale="en" role="teacher" name="Teacher"><main>Groups</main></PlatformShell>);
    expect(teacher).toContain('Teacher workspace · Groups');

    mocks.pathname = '/ar/admin/teachers/abc';
    const admin = renderToStaticMarkup(<PlatformShell locale="ar" role="admin" name="مسؤول"><main>Requests</main></PlatformShell>);
    expect(admin).toContain('الإدارة · طلبات المعلمين');

    mocks.pathname = '/ar/student/saved';
    const student = renderToStaticMarkup(<PlatformShell locale="ar" role="student" name="طالبة"><main>Saved</main></PlatformShell>);
    expect(student).toContain('مساحة الطالب · المحفوظات');
  });

  it('shows a localized unread count in the shared notification link', () => {
    mocks.pathname = '/ar/student';
    const html = renderToStaticMarkup(<PlatformShell locale="ar" role="student" name="طالبة" unreadCount={4}><main>Dashboard</main></PlatformShell>);
    expect(html).toContain('href="/ar/notifications"');
    expect(html).toContain('aria-label="4 غير مقروء"');
    expect(html).toContain('>4</span>');
    expect(html).toContain('مساحة الطالب · مساحة التعلم');
    expect(html).toContain('4 إشعارات غير مقروءة');
    expect(html).toContain('aria-hidden="true" class="shrink-0 rounded-full bg-orange');
  });

  it('does not add the redirected teacher plans destination to admin navigation', () => {
    const html = renderToStaticMarkup(<PlatformShell locale="en" role="admin" name="Admin"><main>Dashboard</main></PlatformShell>);
    expect(html).not.toContain('href="/en/admin/access"');
    expect(html).toContain('href="/en/admin/teachers"');
  });

  it('adds a localized problem-report link for students, teachers, and administrators', () => {
    for (const role of ['student', 'teacher', 'admin'] as const) {
      const html = renderToStaticMarkup(<PlatformShell locale="en" role={role} name="User"><main>Page</main></PlatformShell>);
      expect(html).toContain('href="/en/reports"');
      expect(html).toContain('Report a problem');
    }
    const admin = renderToStaticMarkup(<PlatformShell locale="ar" role="admin" name="مسؤول"><main>Page</main></PlatformShell>);
    expect(admin).toContain('href="/ar/reports"');
    expect(admin).toContain('الإبلاغ عن مشكلة');
    expect(admin).toContain('href="/ar/admin/reports"');
    expect(admin).toContain('البلاغات');
  });
});
