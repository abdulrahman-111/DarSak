import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  getRequestViewer: vi.fn(),
  readTeacherAccessStatus: vi.fn(),
  getSanadConfig: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/teacher-access/data', () => ({
  readTeacherAccessStatus: mocks.readTeacherAccessStatus,
}));
vi.mock('@/features/assistant/config', () => ({ getSanadConfig: mocks.getSanadConfig }));
vi.mock('@/components/sandak/companion', () => ({
  SandakCompanion: ({
    locale,
    access,
    aiEnabled,
    copy,
  }: {
    locale: string;
    access: unknown;
    aiEnabled: boolean;
    copy: { name: string };
  }) =>
    createElement('output', {
      'data-locale': locale,
      'data-access': JSON.stringify(access),
      'data-ai': String(aiEnabled),
      'data-name': copy.name,
    }),
}));

import { SanadLauncher } from '@/features/assistant/launcher';

function html(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

const enabled = { apiKey: 'key', limits: {} };

describe('global SanDak companion mount', () => {
  beforeEach(() => {
    mocks.isConfigured.mockReset().mockReturnValue(true);
    mocks.getRequestViewer.mockReset();
    mocks.readTeacherAccessStatus.mockReset();
    mocks.getSanadConfig.mockReset().mockReturnValue(enabled);
  });

  it('shows the companion with local help only and no AI when Supabase is unavailable', async () => {
    mocks.isConfigured.mockReturnValue(false);
    const rendered = html(await SanadLauncher({ locale: 'en' }));
    expect(rendered).toContain('data-access="null"');
    expect(rendered).toContain('data-ai="false"');
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
  });

  it('passes localized copy from the message dictionaries', async () => {
    mocks.isConfigured.mockReturnValue(false);
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain('data-name="SanDak"');
    expect(html(await SanadLauncher({ locale: 'ar' }))).toContain('data-name="سندك"');
  });

  it.each(['student', 'teacher'] as const)(
    'enables live chat for any active %s when the configuration gate is open',
    async role => {
      mocks.getRequestViewer.mockResolvedValue({
        db: {},
        user: { id: `${role}-id` },
        profile: { role, status: 'active' },
      });
      mocks.readTeacherAccessStatus.mockResolvedValue({
        status: { has_access: true },
        error: false,
      });
      const rendered = html(await SanadLauncher({ locale: 'ar' }));
      expect(rendered).toContain('data-ai="true"');
      expect(rendered).toContain('data-locale="ar"');
    },
  );

  it('falls back to local guided help for signed-in users when SanDak is disabled', async () => {
    mocks.getSanadConfig.mockReturnValue(null);
    mocks.getRequestViewer.mockResolvedValue({
      db: {},
      user: { id: 'student-id' },
      profile: { role: 'student', status: 'active' },
    });
    const rendered = html(await SanadLauncher({ locale: 'en' }));
    expect(rendered).toContain('data-ai="false"');
    expect(rendered).toContain('&quot;role&quot;:&quot;student&quot;');
  });

  it('never enables live chat for administrators', async () => {
    mocks.getRequestViewer.mockResolvedValue({
      db: {},
      user: { id: 'admin-id' },
      profile: { role: 'admin', status: 'active' },
    });
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain('data-ai="false"');
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
    mocks.readTeacherAccessStatus.mockRejectedValue(new Error('status unavailable'));
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain(
      'data-access="{&quot;role&quot;:&quot;teacher&quot;,&quot;canTeach&quot;:false}"',
    );
  });

  it.each([
    ['anonymous', { user: null, profile: null }],
    ['suspended', { user: { id: 'suspended' }, profile: { role: 'student', status: 'suspended' } }],
    ['missing profile', { user: { id: 'missing' }, profile: null }],
  ])('gives %s visitors the companion with local help only and no AI', async (_label, viewer) => {
    mocks.getRequestViewer.mockResolvedValue({ db: {}, ...viewer });
    const rendered = html(await SanadLauncher({ locale: 'en' }));
    expect(rendered).toContain('data-access="null"');
    expect(rendered).toContain('data-ai="false"');
    expect(mocks.readTeacherAccessStatus).not.toHaveBeenCalled();
  });
});
