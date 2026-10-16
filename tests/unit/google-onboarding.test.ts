import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { googleOnboardingDestination } from '@/features/auth/google-onboarding';

vi.mock('server-only', () => ({}));

const application = (status: 'draft' | 'submitted' | 'changes_requested' | 'approved' | 'declined', missing: string[] = [], legacy_approved = false) => ({
  application: {
    teacher_id: 'u1', status, teaching_years: null, admin_phone: '', cv_path: null,
    supporting_links: [], attested: false, snapshot: null, feedback: null,
    submitted_at: null, reviewed_at: null, reviewed_by: null,
    updated_at: '2026-10-16T00:00:00Z', legacy_approved,
  },
  missing,
});

function teacherDb(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { db: { rpc } as unknown as SupabaseClient, rpc };
}

function studentDb(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data, error }));
  const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })) } as unknown as SupabaseClient;
  return { db, maybeSingle };
}

describe('googleOnboardingDestination', () => {
  it('prompts new and legacy students without a completion timestamp', async () => {
    const missing = studentDb(null);
    expect(await googleOnboardingDestination(missing.db, 'u1', 'student', 'en', '/en/student')).toBe('/en/student/profile');
    const legacy = studentDb({ onboarding_completed_at: null });
    expect(await googleOnboardingDestination(legacy.db, 'u1', 'student', 'ar', '/ar/student')).toBe('/ar/student/profile');
  });

  it('sends completed students to the fallback and surfaces lookup failures', async () => {
    const complete = studentDb({ onboarding_completed_at: '2026-10-16T00:00:00Z' });
    expect(await googleOnboardingDestination(complete.db, 'u1', 'student', 'en', '/en/student/classes')).toBe('/en/student/classes');
    const failed = studentDb(null, { message: 'read failed' });
    expect(await googleOnboardingDestination(failed.db, 'u1', 'student', 'en', '/en/student')).toBe('/en/student/profile?onboarding_error=load');
  });

  it.each(['draft', 'changes_requested', 'declined'] as const)('routes %s teachers with missing public fields to their public profile first', async status => {
    const { db, rpc } = teacherDb(application(status, ['headline', 'cv', 'admin_phone']));
    expect(await googleOnboardingDestination(db, 'u1', 'teacher', 'en', '/en/teacher')).toBe('/en/teacher/profile?onboarding=1');
    expect(rpc).toHaveBeenCalledWith('read_teacher_application', { p_teacher_id: 'u1' });
  });

  it('routes teachers with only private requirements to the application', async () => {
    const { db } = teacherDb(application('draft', ['teaching_years', 'admin_phone', 'cv', 'attestation']));
    expect(await googleOnboardingDestination(db, 'u1', 'teacher', 'ar', '/ar/teacher')).toBe('/ar/teacher/application');
  });

  it.each([
    ['submitted', false], ['approved', false], ['approved', true],
  ] as const)('keeps %s legacy_approved=%s teachers on the fallback', async (status, legacyApproved) => {
    const { db } = teacherDb(application(status, ['headline'], legacyApproved));
    expect(await googleOnboardingDestination(db, 'u1', 'teacher', 'en', '/en/teacher')).toBe('/en/teacher');
  });

  it('surfaces failed or malformed teacher application reads', async () => {
    const failed = teacherDb(null, { message: 'read failed' });
    expect(await googleOnboardingDestination(failed.db, 'u1', 'teacher', 'en', '/en/teacher')).toBe('/en/teacher/application?onboarding_error=load');
    const malformed = teacherDb({ application: { status: 'unexpected' }, missing: ['headline'] });
    expect(await googleOnboardingDestination(malformed.db, 'u1', 'teacher', 'ar', '/ar/teacher')).toBe('/ar/teacher/application?onboarding_error=load');
  });
});
