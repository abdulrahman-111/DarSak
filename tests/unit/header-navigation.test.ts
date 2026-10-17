import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), isConfigured: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...props }, children) }));
vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => createElement('img', props) }));
vi.mock('@/components/active-link', () => ({ ActiveLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...props }, children) }));
vi.mock('@/components/locale-switch', () => ({ LocaleSwitch: () => createElement('span') }));
vi.mock('@/features/auth/actions', () => ({ logoutAction: vi.fn() }));
vi.mock('@/features/platform/data', () => ({ currentUser: mocks.currentUser }));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
import { globalReportsHref, Header } from '@/components/header';

describe('global Reports navigation', () => {
  beforeEach(() => {
    mocks.currentUser.mockReset();
    mocks.isConfigured.mockReset().mockReturnValue(true);
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

  it('renders localized admin Reports and hides discovery links from teachers and admins', async () => {
    const labels = { brand: 'Dars', home: 'Home', discover: 'Discover', teacherRole: 'Teach', dashboard: 'Dashboard', account: 'Account', reports: 'Report a problem', logout: 'Log out', login: 'Log in', register: 'Register' };

    mocks.currentUser.mockResolvedValue({ profile: { role: 'admin', status: 'active' } });
    const adminHtml = renderToStaticMarkup(await Header({ locale: 'en', t: labels }));
    expect(adminHtml).toContain('>Reports</a>');
    expect(adminHtml).not.toContain('href="/en/teachers"');

    mocks.currentUser.mockResolvedValue({ profile: { role: 'teacher', status: 'active' } });
    const teacherHtml = renderToStaticMarkup(await Header({ locale: 'ar', t: labels }));
    expect(teacherHtml).toContain('الإبلاغ عن مشكلة');
    expect(teacherHtml).not.toContain('href="/ar/teachers"');
  });
});
