import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueRecoveryProof, PASSWORD_RECOVERY_TTL_SECONDS, verifyRecoveryProof } from '@/features/auth/recovery-proof';

describe('password recovery proof', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('binds a short-lived signed proof to the user and session', () => {
    vi.stubEnv('AUTH_RECOVERY_SECRET', 'a sufficiently long test-only recovery secret');
    const now = 1_800_000_000;
    const proof = issueRecoveryProof('user-1', 'session-1', now);
    expect(proof).toBeTruthy();
    expect(verifyRecoveryProof(proof ?? undefined, 'user-1', 'session-1', now)).toBe(true);
    expect(verifyRecoveryProof(proof ?? undefined, 'user-2', 'session-1', now)).toBe(false);
    expect(verifyRecoveryProof(proof ?? undefined, 'user-1', 'session-2', now)).toBe(false);
    expect(verifyRecoveryProof(proof ?? undefined, 'user-1', 'session-1', now + PASSWORD_RECOVERY_TTL_SECONDS)).toBe(false);
    expect(verifyRecoveryProof(`${proof}x`, 'user-1', 'session-1', now)).toBe(false);
  });

  it('fails closed when the server-only secret is absent or too short', () => {
    vi.stubEnv('AUTH_RECOVERY_SECRET', '');
    expect(issueRecoveryProof('user-1', 'session-1')).toBeNull();
    expect(verifyRecoveryProof('proof', 'user-1', 'session-1')).toBe(false);
    vi.stubEnv('AUTH_RECOVERY_SECRET', 'short');
    expect(issueRecoveryProof('user-1', 'session-1')).toBeNull();
  });
});
