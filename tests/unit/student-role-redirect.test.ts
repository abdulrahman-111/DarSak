import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn(), isConfigured: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), isConfigured: mocks.isConfigured }));

import { student } from '@/features/student/data';

describe('student loader role redirects', () => {
  beforeEach(() => {
    mocks.getRequestViewer.mockReset();
    mocks.isConfigured.mockReset().mockReturnValue(true);
  });

  it.each([
    ['en', 'teacher', '/en/teacher'], ['ar', 'teacher', '/ar/teacher'],
    ['en', 'admin', '/en/admin'], ['ar', 'admin', '/ar/admin'],
  ] as const)('sends active %s wrong-role viewer to %s', async (locale, role, target) => {
    const read = vi.fn();
    mocks.getRequestViewer.mockResolvedValue({ db: { from: read, rpc: read }, user: { id: 'viewer' }, profile: { id: 'viewer', role, status: 'active', full_name: 'Viewer' } });
    await expect(student(locale)).rejects.toThrow(`redirect:${target}`);
    expect(read).not.toHaveBeenCalled();
  });

  it('returns an active student without reading private data in the identity helper', async () => {
    const db = {};
    mocks.getRequestViewer.mockResolvedValue({ db, user: { id: 'student' }, profile: { id: 'student', role: 'student', status: 'active', full_name: 'Sam' } });
    await expect(student('en')).resolves.toMatchObject({ id: 'student', db, role: 'student', status: 'active' });
  });

  it.each([
    ['en', false, null, '/en/login'], ['ar', true, null, '/ar/login'],
    ['en', true, { role: 'student', status: 'suspended' }, '/en/login'], ['ar', true, { role: 'teacher', status: 'suspended' }, '/ar/login'],
    ['en', true, { role: 'visitor', status: 'active' }, '/en/login'], ['ar', true, { role: 'visitor', status: 'active' }, '/ar/login'],
  ] as const)('sends missing, suspended, or unknown %s profile to login', async (locale, hasUser, profile, target) => {
    const read = vi.fn();
    mocks.getRequestViewer.mockResolvedValue({ db: { from: read, rpc: read }, user: hasUser ? { id: 'viewer' } : null, profile: profile ? { id: 'viewer', full_name: 'Viewer', ...profile } : null });
    await expect(student(locale)).rejects.toThrow(`redirect:${target}`);
    expect(read).not.toHaveBeenCalled();
  });
});
