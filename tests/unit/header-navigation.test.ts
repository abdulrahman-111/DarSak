import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  isConfigured: vi.fn(),
  getRequestViewer: vi.fn(),
  unread: vi.fn(),
  pathname: '/en/admin',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));
vi.mock('@/components/active-link', () => ({
  ActiveLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('@/components/locale-switch', () => ({ LocaleSwitch: () => createElement('span') }));
vi.mock('@/features/auth/actions', () => ({ logoutAction: vi.fn() }));
vi.mock('@/features/platform/data', () => ({ currentUser: mocks.currentUser }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/notifications/data', () => ({ unreadNotificationCount: mocks.unread }));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
import { globalReportsHref, Header } from '@/components/header';

describe('global Reports navigation', () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.isConfigured.mockReset().mockReturnValue(true);
    mocks.getRequestViewer.mockReset().mockResolvedValue({ db: {} });
    mocks.unread.mockReset().mockResolvedValue(2);
  });

  it('links active admins to the localized reports page', () => {
    expect(globalReportsHref('en', 'admin')).toBe('/en/admin/reports');
    expect(globalReportsHref('ar', 'admin')).toBe('/ar/admin/reports');
  });

  it('links students and teachers to problem reporting while guests get no link', () => {
    expect(globalReportsHref('en', 'student')).toBe('/en/reports');
    expect(globalReportsHref('ar', 'teacher')).toBe('/ar/reports');
    expect(globalReportsHref('en', null)).toBeNull();
  });

  it('keeps public role work on the mobile bar and removes duplicate header routes for active workspaces', async () => {
    const labels = {
      brand: 'Dars',
      home: 'Home',
      discover: 'Discover',
      teacherRole: 'Teach',
      dashboard: 'Dashboard',
      account: 'Account',
      reports: 'Report a problem',
      logout: 'Log out',
      login: 'Log in',
      register: 'Register',
    };

    mocks.currentUser.mockResolvedValue({ profile: { role: 'admin', status: 'active' } });
    mocks.pathname = '/en/admin';
    const adminHtml = renderToStaticMarkup(await Header({ locale: 'en', t: labels }));
    expect(adminHtml).toContain('data-mobile-workspace-nav="true"');
    expect(adminHtml).toContain('href="/en/admin/reports"');
    expect(adminHtml).toContain('href="/en/admin/users"');
    expect(adminHtml).not.toContain('href="/en/teachers"');

    mocks.currentUser.mockResolvedValue({ profile: { role: 'teacher', status: 'active' } });
    mocks.pathname = '/ar/teacher';
    const teacherHtml = renderToStaticMarkup(await Header({ locale: 'ar', t: labels }));
    expect(teacherHtml).toContain('href="/ar/teacher/lessons"');
    expect(teacherHtml).toContain('href="/ar/teacher/requests"');
    expect(teacherHtml).not.toContain('href="/ar/teachers"');
  });

  it('keeps dashboard and account access for signed-in inactive profiles without showing the workspace bar', async () => {
    const labels = {
      brand: 'Dars',
      home: 'Home',
      discover: 'Discover',
      teacherRole: 'Teach',
      dashboard: 'Dashboard',
      account: 'Account',
      reports: 'Report a problem',
      logout: 'Log out',
      login: 'Log in',
      register: 'Register',
    };

    mocks.currentUser.mockResolvedValue({ profile: { role: 'teacher', status: 'suspended' } });
    mocks.pathname = '/en/account';
    const html = renderToStaticMarkup(await Header({ locale: 'en', t: labels }));

    expect(html).toContain('href="/en/dashboard"');
    expect(html).toContain('href="/en/account"');
    expect(html).not.toContain('data-mobile-workspace-nav="true"');
  });

  it('hides legacy primary navigation for active account and explore workspaces, while guests keep public navigation', async () => {
    const labels = {
      brand: 'Dars',
      home: 'Home',
      discover: 'Discover',
      teacherRole: 'Teach',
      dashboard: 'Dashboard',
      account: 'Account',
      reports: 'Report a problem',
      logout: 'Log out',
      login: 'Log in',
      register: 'Register',
    };

    for (const [role, pathname] of [
      ['student', '/en/account'],
      ['teacher', '/en/teachers'],
      ['admin', '/en/groups/abc'],
    ] as const) {
      mocks.currentUser.mockResolvedValue({ profile: { role, status: 'active' } });
      mocks.pathname = pathname;
      const html = renderToStaticMarkup(await Header({ locale: 'en', t: labels }));
      expect(html).not.toContain(
        'class="hidden items-center gap-6 text-sm font-bold text-ink-soft lg:flex"',
      );
      expect(html).toContain('data-mobile-workspace-nav="true"');
    }

    mocks.currentUser.mockResolvedValue(null);
    mocks.pathname = '/en/teachers';
    const guestHtml = renderToStaticMarkup(await Header({ locale: 'en', t: labels }));
    expect(guestHtml).toContain('aria-label="Primary navigation"');
    expect(guestHtml).not.toContain('href="/en/pricing"');
  });
});
