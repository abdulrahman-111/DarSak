import { describe, expect, it, vi } from 'vitest';
vi.mock('@/features/auth/actions', () => ({ logoutAction: vi.fn() }));
vi.mock('@/features/platform/data', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: vi.fn() }));
import { globalReportsHref } from '@/components/header';

describe('global Reports navigation', () => {
  it('links active admins to the localized reports page', () => {
    expect(globalReportsHref('en', 'admin')).toBe('/en/admin/reports');
    expect(globalReportsHref('ar', 'admin')).toBe('/ar/admin/reports');
  });

  it('does not expose a reports link to other or inactive roles', () => {
    expect(globalReportsHref('en', 'student')).toBeNull();
    expect(globalReportsHref('ar', 'teacher')).toBeNull();
    expect(globalReportsHref('en', null)).toBeNull();
  });
});
