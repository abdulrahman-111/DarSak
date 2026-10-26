import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  getRequestViewer: vi.fn(),
  readTeacherAccessStatus: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/teacher-access/data', () => ({
  readTeacherAccessStatus: mocks.readTeacherAccessStatus,
}));
vi.mock('@/features/assistant/help-drawer', () => ({
  HelpDrawer: ({ locale, access }: { locale: string; access: unknown }) =>
    createElement('output', { 'data-locale': locale, 'data-access': JSON.stringify(access) }),
}));

import { SanadLauncher } from '@/features/assistant/launcher';

function html(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

describe('global Sanad launcher access', () => {
  beforeEach(() => {
    mocks.isConfigured.mockReset().mockReturnValue(true);
    mocks.getRequestViewer.mockReset();
    mocks.readTeacherAccessStatus.mockReset();
  });

  it('uses the public guest view without viewer reads when Supabase is unavailable', async () => {
    mocks.isConfigured.mockReturnValue(false);
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain('data-access="null"');
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
  });

  it.each(['student', 'admin'] as const)('passes fresh active %s access', async role => {
    mocks.getRequestViewer.mockResolvedValue({
      db: { kind: 'same-viewer-db' },
      user: { id: `${role}-id` },
      profile: { role, status: 'active' },
    });
    const rendered = html(await SanadLauncher({ locale: 'ar' }));
    expect(rendered).toContain(
      `data-access="{&quot;role&quot;:&quot;${role}&quot;,&quot;canTeach&quot;:false}"`,
    );
    expect(rendered).toContain('data-locale="ar"');
    expect(mocks.readTeacherAccessStatus).not.toHaveBeenCalled();
  });

  it('checks teaching capability with the same viewer database and fails closed', async () => {
    const db = { kind: 'same-viewer-db' };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'teacher-id' },
      profile: { role: 'teacher', status: 'active' },
    });
    mocks.readTeacherAccessStatus.mockResolvedValue({ status: { has_access: true }, error: false });
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain(
      'data-access="{&quot;role&quot;:&quot;teacher&quot;,&quot;canTeach&quot;:true}"',
    );
    expect(mocks.readTeacherAccessStatus).toHaveBeenCalledWith(db);

    mocks.readTeacherAccessStatus.mockResolvedValue({
      status: { has_access: false },
      error: false,
    });
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain(
      'data-access="{&quot;role&quot;:&quot;teacher&quot;,&quot;canTeach&quot;:false}"',
    );
    mocks.readTeacherAccessStatus.mockRejectedValue(new Error('status unavailable'));
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain(
      'data-access="{&quot;role&quot;:&quot;teacher&quot;,&quot;canTeach&quot;:false}"',
    );
  });

  it.each([
    ['anonymous', { user: null, profile: null }],
    ['suspended', { user: { id: 'suspended' }, profile: { role: 'student', status: 'suspended' } }],
    ['missing profile', { user: { id: 'missing' }, profile: null }],
  ])('uses guest mode for %s viewers', async (_label, viewer) => {
    mocks.getRequestViewer.mockResolvedValue({ db: {}, ...viewer });
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain('data-access="null"');
    expect(mocks.readTeacherAccessStatus).not.toHaveBeenCalled();
  });
});
