import { describe, expect, it } from 'vitest';
import {
  canAssignPlan,
  parsePlanAssignmentInput,
  parseTeacherPlanStatus,
  parseTransactionReference,
} from '../../src/features/subscriptions/domain';

const valid = {
  plan_code: 'free',
  plan_active: false,
  starts_at: null,
  expires_at: null,
  updated_version: 0,
  quotas_enabled: false,
  quotas_effective_at: '2026-11-15T00:00:00+02:00',
  active_groups: 0,
  stored_files: 0,
  stored_bytes: 0,
  limits: { groups: 0, files: 0, bytes: 0, file_bytes: 10485760 },
};

describe('subscription input parsing', () => {
  it('accepts a single status row and a one-row RPC result', () => {
    expect(parseTeacherPlanStatus(valid)?.plan_code).toBe('free');
    expect(parseTeacherPlanStatus([valid])?.updated_version).toBe(0);
  });
  it('rejects malformed RPC rows rather than turning missing usage into zero', () => {
    expect(parseTeacherPlanStatus({ ...valid, stored_files: undefined })).toBeNull();
    expect(parseTeacherPlanStatus({ ...valid, plan_code: 'mystery' })).toBeNull();
  });
  it('permits assignments only when the policy is enabled and effective', () => {
    expect(canAssignPlan(parseTeacherPlanStatus(valid)!, Date.parse('2026-11-16T00:00:00Z'))).toBe(
      false,
    );
    expect(
      canAssignPlan(
        parseTeacherPlanStatus({ ...valid, quotas_enabled: true })!,
        Date.parse('2026-11-16T00:00:00Z'),
      ),
    ).toBe(true);
  });
  it('normalizes and bounds verified transaction references', () => {
    expect(parseTransactionReference('  BANK   REF 123 ')).toBe('BANK REF 123');
    expect(parseTransactionReference(' xx ')).toBeNull();
    expect(parseTransactionReference('x'.repeat(121))).toBeNull();
    expect(parseTransactionReference(null)).toBeNull();
  });
  it('requires a valid plan, concurrency version, reference, and bank-ledger check', () => {
    expect(
      parsePlanAssignmentInput({
        plan: 'standard',
        version: '0',
        reference: 'TXN 1234',
        bankChecked: 'on',
      }),
    ).toEqual({ plan: 'standard', version: 0, reference: 'TXN 1234' });
    expect(
      parsePlanAssignmentInput({
        plan: 'pro',
        version: '3',
        reference: 'TXN 1234',
        bankChecked: '',
      }),
    ).toBeNull();
    expect(
      parsePlanAssignmentInput({
        plan: 'free',
        version: '3',
        reference: 'TXN 1234',
        bankChecked: 'on',
      }),
    ).toBeNull();
  });
});
