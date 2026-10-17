import { describe, expect, it } from 'vitest';
import { PLAN_EFFECTIVE_AT, PLAN_ENFORCEMENT_DEFAULT_ENABLED, TEACHER_PLANS } from '@/features/subscriptions/plans';

describe('published teacher plan contract', () => {
  it('shares prices, simultaneous caps, and the per-file safety limit', () => {
    expect(TEACHER_PLANS.standard).toMatchObject({ planCode: 'standard', monthlyEgp: 100, activeGroups: 5, storedFiles: 100, storageBytes: 250 * 1024 * 1024, maxFileBytes: 10 * 1024 * 1024 });
    expect(TEACHER_PLANS.pro).toMatchObject({ planCode: 'pro', monthlyEgp: 200, activeGroups: 20, storedFiles: 500, storageBytes: 1024 ** 3, maxFileBytes: 10 * 1024 * 1024 });
  });

  it('starts no earlier than midnight Cairo on 15 November and leaves enforcement off', () => {
    expect(PLAN_EFFECTIVE_AT).toBe('2026-11-14T22:00:00.000Z');
    expect(new Date(PLAN_EFFECTIVE_AT).toISOString()).toBe('2026-11-14T22:00:00.000Z');
    expect(PLAN_ENFORCEMENT_DEFAULT_ENABLED).toBe(false);
  });
});
