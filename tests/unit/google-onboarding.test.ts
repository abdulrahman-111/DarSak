import { describe, expect, it, vi } from 'vitest';
import { googleOnboardingDestination } from '@/features/auth/google-onboarding';

const { resolver } = vi.hoisted(() => ({
  resolver: vi.fn(
    async (_db: unknown, _id: string, _role: string, _locale: string, fallback: string) => fallback,
  ),
}));
vi.mock('@/features/setup/destination', () => ({ resolveSetupDestination: resolver }));

describe('legacy Google onboarding export', () => {
  it('forwards callers to the shared setup resolver', async () => {
    const db = {};
    await expect(
      googleOnboardingDestination(db as never, 'u1', 'teacher', 'en', '/en/teacher'),
    ).resolves.toBe('/en/teacher');
    expect(resolver).toHaveBeenCalledWith(db, 'u1', 'teacher', 'en', '/en/teacher');
  });
});
