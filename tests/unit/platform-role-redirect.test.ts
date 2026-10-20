import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestViewer: vi.fn(),
  isConfigured: vi.fn(),
  teacherAccess: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  isConfigured: mocks.isConfigured,
}));
vi.mock('@/features/teacher-access/data', () => ({ readTeacherAccessStatus: mocks.teacherAccess }));

import { requireViewer } from '@/components/platform/access';

describe('platform role redirects', () => {
  beforeEach(() => {
    mocks.getRequestViewer.mockReset();
    mocks.isConfigured.mockReset().mockReturnValue(true);
    mocks.teacherAccess.mockReset();
  });

  it.each([
    ['en', 'teacher', 'student', '/en/student'],
    ['ar', 'teacher', 'student', '/ar/student'],
    ['en', 'student', 'admin', '/en/admin'],
    ['ar', 'student', 'admin', '/ar/admin'],
  ] as const)(
    'redirects %s %s-area mismatch to actual role home',
    async (locale, role, activeRole, target) => {
      const read = vi.fn();
      const db = { from: read, rpc: read };
      mocks.getRequestViewer.mockResolvedValue({
        db,
        user: { id: 'viewer' },
        profile: { id: 'viewer', role: activeRole, status: 'active', full_name: 'Viewer' },
      });
      await expect(requireViewer(locale, role)).rejects.toThrow(`redirect:${target}`);
      expect(read).not.toHaveBeenCalled();
      expect(mocks.teacherAccess).not.toHaveBeenCalled();
    },
  );

  it('returns the verified viewer when role matches', async () => {
    const db = {};
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id: 'teacher', email: 't@example.test' },
      profile: { id: 'teacher', role: 'teacher', status: 'active', full_name: 'Taylor' },
    });
    await expect(requireViewer('en', 'teacher')).resolves.toMatchObject({
      id: 'teacher',
      role: 'teacher',
      db,
    });
  });

  it.each([
    ['en', false, null, '/en/login'],
    ['ar', true, null, '/ar/login'],
    ['en', true, { role: 'teacher', status: 'suspended' }, '/en/login'],
    ['ar', true, { role: 'student', status: 'suspended' }, '/ar/login'],
    ['en', true, { role: 'visitor', status: 'active' }, '/en/login'],
    ['ar', true, { role: 'visitor', status: 'active' }, '/ar/login'],
  ] as const)(
    'sends missing, suspended, or unknown role profile to %s login',
    async (locale, hasUser, profile, target) => {
      const read = vi.fn();
      mocks.getRequestViewer.mockResolvedValue({
        db: { from: read, rpc: read },
        user: hasUser ? { id: 'viewer' } : null,
        profile: profile ? { id: 'viewer', full_name: 'Viewer', ...profile } : null,
      });
      await expect(requireViewer(locale, 'teacher')).rejects.toThrow(`redirect:${target}`);
      expect(read).not.toHaveBeenCalled();
    },
  );
});
