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
vi.mock('@/components/sandak/assistant-mount', () => ({
  AssistantMount: ({ locale, copy }: { locale: string; copy: { name: string } }) =>
    createElement('output', { 'data-locale': locale, 'data-name': copy.name }),
}));

import { resolveAssistant, SanadLauncher } from '@/features/assistant/launcher';

function html(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

const enabled = { apiKey: 'key', limits: {} };

describe('global SanDai companion mount', () => {
  beforeEach(() => {
    mocks.isConfigured.mockReset().mockReturnValue(true);
    mocks.getRequestViewer.mockReset();
    mocks.readTeacherAccessStatus.mockReset();
    mocks.getSanadConfig.mockReset().mockReturnValue(enabled);
  });

  it('shows the companion with local help only and no AI when Supabase is unavailable', async () => {
    mocks.isConfigured.mockReturnValue(false);
    expect(await resolveAssistant()).toEqual({ access: null, key: 'guest', aiEnabled: false });
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
  });

  it('passes localized copy from the message dictionaries', async () => {
    mocks.isConfigured.mockReturnValue(false);
    expect(html(await SanadLauncher({ locale: 'en' }))).toContain('data-name="SanDai"');
    expect(html(await SanadLauncher({ locale: 'ar' }))).toContain('data-name="سندي"');
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
      const assistant = await resolveAssistant();
      expect(assistant.aiEnabled).toBe(true);
      expect(assistant.access).toEqual({ role, canTeach: role === 'teacher' });
      expect(html(await SanadLauncher({ locale: 'ar' }))).toContain('data-locale="ar"');
    },
  );

  it('falls back to local guided help for signed-in users when SanDai is disabled', async () => {
    mocks.getSanadConfig.mockReturnValue(null);
    mocks.getRequestViewer.mockResolvedValue({
      db: {},
      user: { id: 'student-id' },
      profile: { role: 'student', status: 'active' },
    });
    const assistant = await resolveAssistant();
    expect(assistant.aiEnabled).toBe(false);
    expect(assistant.access).toEqual({ role: 'student', canTeach: false });
  });

  it('never enables live chat for administrators', async () => {
    mocks.getRequestViewer.mockResolvedValue({
      db: {},
      user: { id: 'admin-id' },
      profile: { role: 'admin', status: 'active' },
    });
    expect((await resolveAssistant()).aiEnabled).toBe(false);
  });

  it('checks teaching capability with the same viewer database and fails closed', async () => {
    const db = { kind: 'same-viewer-db' };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'teacher-id' },
      profile: { role: 'teacher', status: 'active' },
    });
    mocks.readTeacherAccessStatus.mockResolvedValue({ status: { has_access: true }, error: false });
    expect((await resolveAssistant()).access).toEqual({ role: 'teacher', canTeach: true });
    expect(mocks.readTeacherAccessStatus).toHaveBeenCalledWith(db);
    mocks.readTeacherAccessStatus.mockRejectedValue(new Error('status unavailable'));
    expect((await resolveAssistant()).access).toEqual({ role: 'teacher', canTeach: false });
  });

  it.each([
    ['anonymous', { user: null, profile: null }],
    ['suspended', { user: { id: 'suspended' }, profile: { role: 'student', status: 'suspended' } }],
    ['missing profile', { user: { id: 'missing' }, profile: null }],
  ])('gives %s visitors the companion with local help only and no AI', async (_label, viewer) => {
    mocks.getRequestViewer.mockResolvedValue({ db: {}, ...viewer });
    expect(await resolveAssistant()).toMatchObject({ access: null, aiEnabled: false });
    expect(mocks.readTeacherAccessStatus).not.toHaveBeenCalled();
  });
});
