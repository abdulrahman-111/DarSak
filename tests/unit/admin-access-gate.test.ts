import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@admin/lib/supabase/server', () => ({
  createClient: createClientMock,
  isConfigured: () => true,
}));

import { getAdminActor, getAdminAccess, requireAdminActor } from '@admin/lib/access';

function db({
  user = true,
  role = 'admin',
  status = 'active',
  current = 'aal2',
  next = 'aal2',
  aalError = false,
}: {
  user?: boolean;
  role?: string;
  status?: string;
  current?: string;
  next?: string;
  aalError?: boolean;
} = {}) {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: user ? { id: 'u1', email: 'a@example.test' } : null },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () =>
          aalError
            ? { data: null, error: { message: 'x' } }
            : { data: { currentLevel: current, nextLevel: next }, error: null },
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role, status, full_name: 'A' }, error: null }),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  process.env.ADMIN_APP = 'true';
  createClientMock.mockReset();
  redirectMock.mockClear();
});

describe('admin access gate', () => {
  it('grants an active admin at aal2', async () => {
    db();
    expect((await getAdminActor())?.id).toBe('u1');
    expect((await requireAdminActor('en')).email).toBe('a@example.test');
  });

  it('refuses an aal1 session with a verified factor and routes to verification', async () => {
    db({ current: 'aal1', next: 'aal2' });
    expect(await getAdminActor()).toBeNull();
    expect((await getAdminAccess()).status).toBe('mfa-verify');
    await expect(requireAdminActor('en')).rejects.toThrow('REDIRECT:/en/mfa/verify');
  });

  it('refuses an admin with no factor and routes to enrolment', async () => {
    db({ current: 'aal1', next: 'aal1' });
    expect(await getAdminActor()).toBeNull();
    await expect(requireAdminActor('ar')).rejects.toThrow('REDIRECT:/ar/mfa/enroll');
  });

  it('refuses when the assurance level cannot be read', async () => {
    db({ aalError: true });
    expect(await getAdminActor()).toBeNull();
  });

  it('refuses non-admins and suspended admins even at aal2', async () => {
    db({ role: 'teacher' });
    expect(await getAdminActor()).toBeNull();
    db({ status: 'suspended' });
    expect(await getAdminActor()).toBeNull();
    await expect(requireAdminActor('en')).rejects.toThrow('REDIRECT:/en/login');
  });

  it('refuses anonymous visitors and a disabled admin app', async () => {
    db({ user: false });
    expect((await getAdminAccess()).status).toBe('anonymous');
    db();
    process.env.ADMIN_APP = 'false';
    expect(await getAdminActor()).toBeNull();
  });
});
