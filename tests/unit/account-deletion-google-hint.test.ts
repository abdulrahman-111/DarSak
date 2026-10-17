import { describe, expect, it } from 'vitest';
import { googleReauthHint, googleReauthHintMatches } from '@/features/account/google-hint';

describe('Google reauthentication UI hint', () => {
  it('matches only the callback-verified intent and original owner pair', () => {
    const hint = googleReauthHint('intent-1', 'owner-1');
    expect(googleReauthHintMatches(hint, 'intent-1', 'owner-1')).toBe(true);
    expect(googleReauthHintMatches(hint, 'intent-2', 'owner-1')).toBe(false);
    expect(googleReauthHintMatches(hint, 'intent-1', 'owner-2')).toBe(false);
    expect(googleReauthHintMatches(undefined, 'intent-1', 'owner-1')).toBe(false);
  });
});
