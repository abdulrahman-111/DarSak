import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), status: vi.fn(), redirect: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/components/platform/access', () => ({ requireViewer: mocks.viewer }));
vi.mock('@/features/teacher-access/data', () => ({ readTeacherAccessStatus: mocks.status }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    mocks.redirect(to);
    throw new Error(`redirect:${to}`);
  },
}));

import { teachingAccessRedirect } from '@/features/teacher/teaching-access-gate-domain';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';

const ok = { status: { has_access: true }, error: false } as never;

describe('teachingAccessRedirect', () => {
  it('allows teachers with access', () => {
    expect(teachingAccessRedirect('en', ok)).toBeNull();
  });
  it('sends unreadable status to the unavailable notice and lapsed access to renewal', () => {
    expect(teachingAccessRedirect('ar', { status: null, error: true } as never)).toBe(
      '/ar/account/teaching-access?error=unavailable',
    );
    expect(
      teachingAccessRedirect('en', { status: { has_access: false }, error: false } as never),
    ).toBe('/en/account/teaching-access');
  });
});

describe('loadWithTeachingAccess', () => {
  beforeEach(() => {
    mocks.viewer.mockReset().mockResolvedValue({ db: {}, id: 't1' });
    mocks.status.mockReset().mockResolvedValue(ok);
    mocks.redirect.mockReset();
  });

  it('starts the page reads without waiting for the access check', async () => {
    let release!: (value: unknown) => void;
    mocks.status.mockReturnValue(new Promise(resolve => (release = resolve)));
    const load = vi.fn().mockResolvedValue('rows');
    const result = loadWithTeachingAccess('en', load);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    release(ok);
    await expect(result).resolves.toMatchObject({ data: 'rows' });
  });

  it('redirects lapsed teachers and never returns the loaded data', async () => {
    mocks.status.mockResolvedValue({ status: { has_access: false }, error: false });
    await expect(loadWithTeachingAccess('en', async () => 'secret')).rejects.toThrow(
      'redirect:/en/account/teaching-access',
    );
  });

  it('prefers the access redirect over a loader failure, and rethrows loader failures otherwise', async () => {
    mocks.status.mockResolvedValue({ status: null, error: true });
    await expect(
      loadWithTeachingAccess('en', async () => {
        throw new Error('db down');
      }),
    ).rejects.toThrow('redirect:/en/account/teaching-access?error=unavailable');
    mocks.status.mockResolvedValue(ok);
    await expect(
      loadWithTeachingAccess('en', async () => {
        throw new Error('db down');
      }),
    ).rejects.toThrow('db down');
  });
});
