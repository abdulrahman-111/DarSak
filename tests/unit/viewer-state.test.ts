import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  getRequestViewer: vi.fn(),
  unread: vi.fn(),
  resolveAssistant: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/notifications/data', () => ({ unreadNotificationCount: mocks.unread }));
vi.mock('@/features/assistant/launcher', () => ({ resolveAssistant: mocks.resolveAssistant }));

import { loadViewerState } from '@/features/platform/viewer-state';
import { ANONYMOUS_VIEWER } from '@/features/platform/viewer-state-types';
import { GET } from '@/app/api/viewer/route';

const assistant = { access: { role: 'student', canTeach: false }, key: 'k', aiEnabled: true };

describe('viewer state for the client header', () => {
  beforeEach(() => {
    mocks.isConfigured.mockReset().mockReturnValue(true);
    mocks.getRequestViewer.mockReset();
    mocks.unread.mockReset().mockResolvedValue(4);
    mocks.resolveAssistant.mockReset().mockResolvedValue(assistant);
  });

  it('is anonymous without touching Supabase when it is not configured', async () => {
    mocks.isConfigured.mockReturnValue(false);
    expect(await loadViewerState()).toEqual(ANONYMOUS_VIEWER);
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
  });

  it('is anonymous when there is no verified user', async () => {
    mocks.getRequestViewer.mockResolvedValue({ db: {}, user: null, profile: null });
    expect(await loadViewerState()).toEqual(ANONYMOUS_VIEWER);
    expect(mocks.unread).not.toHaveBeenCalled();
  });

  it('exposes the workspace role and unread count only for active students and teachers', async () => {
    const db = {};
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'u' },
      profile: { role: 'student', status: 'active', full_name: 'Sara' },
    });
    expect(await loadViewerState()).toEqual({
      signedIn: true,
      activeRole: 'student',
      fullName: 'Sara',
      unreadCount: 4,
      assistant,
    });
    expect(mocks.unread).toHaveBeenCalledWith(db);

    mocks.unread.mockClear();
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'u' },
      profile: { role: 'teacher', status: 'suspended', full_name: 'T' },
    });
    expect(await loadViewerState()).toMatchObject({
      signedIn: true,
      activeRole: null,
      unreadCount: null,
    });
    expect(mocks.unread).not.toHaveBeenCalled();
  });

  it('serves the snapshot privately and fails closed to the guest header', async () => {
    mocks.getRequestViewer.mockResolvedValue({ db: {}, user: null, profile: null });
    const ok = await GET();
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await ok.json()).toEqual(ANONYMOUS_VIEWER);

    mocks.getRequestViewer.mockRejectedValue(new Error('boom'));
    const failed = await GET();
    expect(failed.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await failed.json()).toEqual(ANONYMOUS_VIEWER);
  });
});
