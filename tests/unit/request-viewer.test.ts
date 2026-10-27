import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: (...args: unknown[]) => unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));

import { getRequestViewer } from '@/features/platform/request-viewer';

describe('public request viewer', () => {
  beforeEach(() => createClientMock.mockReset());

  it('rejects an admin profile and clears only the local public session', async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const db = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'admin-id' } }, error: null })),
        signOut,
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'admin-id', role: 'admin', status: 'active' },
              error: null,
            }),
          }),
        }),
      }),
    };
    createClientMock.mockResolvedValue(db);
    const viewer = await getRequestViewer();
    expect(viewer.user).toBeNull();
    expect(viewer.profile).toBeNull();
    expect(viewer.adminRejected).toBe(true);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each(['student', 'teacher'])('preserves an active %s viewer', async role => {
    const user = { id: `${role}-id` };
    const profile = { id: user.id, role, status: 'active' };
    createClientMock.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
        }),
      }),
    });
    const viewer = await getRequestViewer();
    expect(viewer.user).toEqual(user);
    expect(viewer.profile).toEqual(profile);
    expect(viewer.adminRejected).toBe(false);
  });
});
