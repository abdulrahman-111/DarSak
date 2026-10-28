import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: '/en/admin' }));
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
import { globalReportsHref, HeaderView } from '@/components/header';
import { ANONYMOUS_VIEWER, type ViewerState } from '@/features/platform/viewer-state-types';

function viewer(role: 'student' | 'teacher' | null, signedIn = role !== null): ViewerState {
  return { ...ANONYMOUS_VIEWER, signedIn, activeRole: role, unreadCount: role ? 2 : null };
}

describe('global Reports navigation', () => {
  it('does not send public header navigation to administrator routes', () => {
    expect(globalReportsHref('en', 'admin')).toBeNull();
    expect(globalReportsHref('ar', 'admin')).toBeNull();
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

    mocks.pathname = '/en';
    const adminHtml = renderToStaticMarkup(
      HeaderView({ locale: 'en', t: labels, viewer: ANONYMOUS_VIEWER }),
    );
    expect(adminHtml).not.toContain('/en/admin');
    expect(adminHtml).toContain('href="/en/teachers"');

    mocks.pathname = '/ar/teacher';
    const teacherHtml = renderToStaticMarkup(
      HeaderView({ locale: 'ar', t: labels, viewer: viewer('teacher') }),
    );
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

    const v = viewer(null, true);
    mocks.pathname = '/en/account';
    const html = renderToStaticMarkup(HeaderView({ locale: 'en', t: labels, viewer: v }));

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
    ] as const) {
      mocks.pathname = pathname;
      const html = renderToStaticMarkup(
        HeaderView({ locale: 'en', t: labels, viewer: viewer(role) }),
      );
      expect(html).not.toContain(
        'class="hidden items-center gap-6 text-sm font-bold text-ink-soft lg:flex"',
      );
      expect(html).toContain('data-mobile-workspace-nav="true"');
    }

    mocks.pathname = '/en/teachers';
    const guestHtml = renderToStaticMarkup(
      HeaderView({ locale: 'en', t: labels, viewer: ANONYMOUS_VIEWER }),
    );
    expect(guestHtml).toContain('aria-label="Primary navigation"');
    expect(guestHtml).not.toContain('href="/en/pricing"');
  });

  it('renders a stable shell with an account skeleton until the viewer is known', () => {
    const labels = {
      brand: 'Dars',
      home: 'Home',
      discover: 'Discover',
      teachOnDarsak: 'Teach',
      dashboard: 'Dashboard',
      account: 'Account',
      logout: 'Log out',
      login: 'Log in',
      register: 'Register',
    };
    mocks.pathname = '/en';
    const html = renderToStaticMarkup(HeaderView({ locale: 'en', t: labels, viewer: null }));
    expect(html).toContain('data-header-account-skeleton="true"');
    expect(html).toContain('href="/en"');
    expect(html).toContain('href="/en/teachers"');
    expect(html).not.toContain('href="/en/login"');
    expect(html).not.toContain('Log out');
    const guest = renderToStaticMarkup(
      HeaderView({ locale: 'en', t: labels, viewer: ANONYMOUS_VIEWER }),
    );
    expect(guest).not.toContain('data-header-account-skeleton');
    expect(guest).toContain('href="/en/login"');
  });
});
