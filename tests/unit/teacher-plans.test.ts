import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAN_ENFORCEMENT_DEFAULT_ENABLED, TEACHER_PLANS } from '@/features/subscriptions/plans';
import { TeacherPlanPanel } from '@/features/subscriptions/panels';

describe('published teacher plan contract', () => {
  it('shares prices, simultaneous caps, and the per-file safety limit', () => {
    expect(TEACHER_PLANS.standard).toMatchObject({ planCode: 'standard', monthlyEgp: 100, activeGroups: 5, storedFiles: 100, storageBytes: 250 * 1024 * 1024, maxFileBytes: 10 * 1024 * 1024 });
    expect(TEACHER_PLANS.pro).toMatchObject({ planCode: 'pro', monthlyEgp: 200, activeGroups: 20, storedFiles: 500, storageBytes: 1024 ** 3, maxFileBytes: 10 * 1024 * 1024 });
  });

  it('leaves enforcement off until the launch policy is explicitly enabled', () => {
    expect(PLAN_ENFORCEMENT_DEFAULT_ENABLED).toBe(false);
  });

  it('shows free-launch timing without pricing links or promoted amounts', () => {
    const status = {
      plan_code: 'free' as const, plan_active: false, starts_at: null, expires_at: null, updated_version: 1,
      quotas_enabled: false, quotas_effective_at: null, active_groups: 0, stored_files: 0, stored_bytes: 0,
      limits: { groups: 0, files: 0, bytes: 0, file_bytes: 0 },
    };
    const html = renderToStaticMarkup(createElement(TeacherPlanPanel, { locale: 'en', status, error: false }));
    expect(html).toContain('free until next semester');
    expect(html).toContain('Paid plans will be announced before they begin');
    expect(html).not.toMatch(/\/pricing|EGP 100|EGP 200/);
  });
});
