import { createHmac, timingSafeEqual } from 'node:crypto';

export const PASSWORD_RECOVERY_COOKIE = 'dars-password-recovery';
export const PASSWORD_RECOVERY_TTL_SECONDS = 15 * 60;

function secret() {
  const value = process.env.AUTH_RECOVERY_SECRET;
  return value && Buffer.byteLength(value, 'utf8') >= 32 ? value : null;
}

function signature(payload: string, key: string) {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function issueRecoveryProof(
  userId: string,
  sessionId: string,
  now = Math.floor(Date.now() / 1000),
) {
  const key = secret();
  if (!key || !userId || !sessionId) return null;
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, sid: sessionId, exp: now + PASSWORD_RECOVERY_TTL_SECONDS }),
  ).toString('base64url');
  return `${payload}.${signature(payload, key)}`;
}

export function verifyRecoveryProof(
  token: string | undefined,
  userId: string,
  sessionId: string,
  now = Math.floor(Date.now() / 1000),
) {
  const key = secret();
  if (!key || !token || !userId || !sessionId) return false;
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra !== undefined) return false;
  const expectedSignature = signature(payload, key);
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  const expected = Buffer.from(expectedSignature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  try {
    const proof = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
      sid?: unknown;
      exp?: unknown;
    };
    return (
      proof.sub === userId &&
      proof.sid === sessionId &&
      typeof proof.exp === 'number' &&
      Number.isInteger(proof.exp) &&
      proof.exp > now &&
      proof.exp <= now + PASSWORD_RECOVERY_TTL_SECONDS
    );
  } catch {
    return false;
  }
}
