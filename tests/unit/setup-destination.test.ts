import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveSetupDestination, safeSetupReturnPath } from '@/features/setup/destination';

const userId = '00000000-0000-4000-8000-000000000001';
const groupPath = '/en/groups/00000000-0000-4000-8000-000000000002';

function dbFor(rows: Record<string, unknown>, errors: Record<string, unknown> = {}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null, error: errors[table] ?? null })),
        })),
      })),
    })),
  } as never;
}

describe('setup destination resolver', () => {
  it('sends incomplete teachers to setup and preserves a safe group return path', async () => {
    const result = await resolveSetupDestination(dbFor({
      profiles: { role: 'teacher', status: 'active' },
      teacher_applications: { status: 'changes_requested', legacy_approved: false },
    }), userId, 'teacher', 'en', groupPath);

    const parsed = new URL(result, 'https://local.invalid');
    expect(parsed.pathname).toBe('/en/account/setup');
    expect(parsed.searchParams.get('returnTo')).toBe(groupPath);
  });

  it('routes submitted teachers to application status and approved teachers to their workspace', async () => {
    const profile = { role: 'teacher', status: 'active' };
    expect(await resolveSetupDestination(dbFor({
      profiles: profile,
      teacher_applications: { status: 'submitted', legacy_approved: false },
    }), userId, 'teacher', 'ar', '/ar/teacher')).toBe('/ar/account/application');

    expect(await resolveSetupDestination(dbFor({
      profiles: profile,
      teacher_applications: { status: 'approved', legacy_approved: false },
    }), userId, 'teacher', 'ar', '/ar/teacher')).toBe('/ar/teacher');
  });

  it('sends required incomplete students to setup and leaves migrated optional students alone', async () => {
    const profile = { role: 'student', status: 'active' };
    const incomplete = await resolveSetupDestination(dbFor({
      profiles: profile,
      student_profiles: { onboarding_required: true, onboarding_completed_at: null },
    }), userId, 'student', 'en', '/en/student');
    expect(new URL(incomplete, 'https://local.invalid').pathname).toBe('/en/account/setup');

    expect(await resolveSetupDestination(dbFor({
      profiles: profile,
      student_profiles: { onboarding_required: false, onboarding_completed_at: null },
    }), userId, 'student', 'en', '/en/student')).toBe('/en/student');
  });

  it('returns a recoverable setup error for failed canonical reads', async () => {
    const result = await resolveSetupDestination(dbFor({ profiles: { role: 'student', status: 'active' } }, {
      student_profiles: new Error('read failed'),
    }), userId, 'student', 'en', groupPath);
    const parsed = new URL(result, 'https://local.invalid');
    expect(parsed.pathname).toBe('/en/account/setup');
    expect(parsed.searchParams.get('load')).toBe('error');
    expect(parsed.searchParams.get('returnTo')).toBe(groupPath);
  });

  it('rejects unsafe or cross-locale return paths', () => {
    expect(safeSetupReturnPath('en', 'teacher', '/en/groups/00000000-0000-4000-8000-000000000002')).toBe(groupPath);
    expect(safeSetupReturnPath('en', 'teacher', '//evil.invalid/en/teacher')).toBeNull();
    expect(safeSetupReturnPath('en', 'teacher', '/ar/teacher')).toBeNull();
    expect(safeSetupReturnPath('en', 'teacher', '/en/account/delete')).toBeNull();
  });
});
