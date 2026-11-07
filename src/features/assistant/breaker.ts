import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RETRY_AFTER_SECONDS = 15 * 60;

export type ProviderOutcome = 'success' | 'quota_error' | 'other_error' | 'cancelled';
export type ProviderClaim =
  { allowed: true; attempt: string } | { allowed: false; attempt: null; retryAfter: number };

/** Safe rollout switch until the trusted service-role RPC path is provisioned. */
export function isProviderBreakerEnabled(): boolean {
  return process.env.SANAD_PROVIDER_BREAKER_ENABLED === 'true';
}

function parsedClaim(value: unknown): ProviderClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('provider breaker unavailable');
  }
  const claim = value as { allowed?: unknown; attempt?: unknown; retry_after?: unknown };
  if (claim.allowed === true && typeof claim.attempt === 'string' && UUID.test(claim.attempt)) {
    return { allowed: true, attempt: claim.attempt };
  }
  if (
    claim.allowed === false &&
    claim.attempt === null &&
    Number.isInteger(claim.retry_after) &&
    (claim.retry_after as number) >= 1 &&
    (claim.retry_after as number) <= MAX_RETRY_AFTER_SECONDS
  ) {
    return { allowed: false, attempt: null, retryAfter: claim.retry_after as number };
  }
  throw new Error('provider breaker unavailable');
}

/** Claims a provider attempt. RPC failures and malformed replies always fail closed. */
export async function claimProviderAttempt(): Promise<ProviderClaim> {
  const { data, error } = await createAdminClient().rpc('sanad_provider_claim');
  if (error) throw new Error('provider breaker unavailable');
  return parsedClaim(data);
}

/** Completes a claim once; the database fences stale and replayed attempt tokens. */
export async function finishProviderAttempt(
  attempt: string,
  outcome: ProviderOutcome,
): Promise<void> {
  if (!UUID.test(attempt)) throw new Error('provider breaker unavailable');
  const { error } = await createAdminClient().rpc('sanad_provider_finish', {
    p_attempt: attempt,
    p_outcome: outcome,
  });
  if (error) throw new Error('provider breaker unavailable');
}
