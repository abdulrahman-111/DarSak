import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, isFreshOauthProof, oauthAmrTimestamp } from '../../supabase/functions/delete-account/oauth-proof';

const now = 1_800_000_000;

describe('Google deletion reauthentication proof', () => {
  it('accepts only a recent oauth AMR timestamp', () => {
    expect(isFreshOauthProof({ amr: [{ method: 'oauth', timestamp: now - 299 }] }, now)).toBe(true);
    expect(isFreshOauthProof({ amr: [{ method: 'oauth', timestamp: now - 301 }] }, now)).toBe(false);
    expect(isFreshOauthProof({ iat: now, last_sign_in_at: new Date(now * 1000).toISOString() }, now)).toBe(false);
    expect(isFreshOauthProof({ amr: [{ method: 'password', timestamp: now }] }, now)).toBe(false);
  });

  it('rejects implausibly future proof and handles the allowed clock skew', () => {
    expect(isFreshOauthProof({ amr: [{ method: 'oauth', timestamp: now + 61 }] }, now)).toBe(false);
    expect(isFreshOauthProof({ amr: [{ method: 'oauth', timestamp: now + 60 }] }, now)).toBe(true);
  });

  it('parses the signed-token payload format without treating decoding as signature validation', () => {
    const part = Buffer.from(JSON.stringify({ sub: 'owner', amr: [{ method: 'oauth', timestamp: now }] })).toString('base64url');
    const payload = decodeJwtPayload(`header.${part}.signature`)!;
    expect(payload.sub).toBe('owner');
    expect(oauthAmrTimestamp(payload)).toBe(now);
    expect(decodeJwtPayload('malformed')).toBeNull();
  });
});
