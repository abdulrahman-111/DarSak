import { timingSafeEqual } from 'node:crypto';

export function validCronAuthorization(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  const size = Math.max(provided.length, expected.length, 1);
  const left = Buffer.alloc(size), right = Buffer.alloc(size);
  provided.copy(left); expected.copy(right);
  const equal = timingSafeEqual(left, right);
  return equal && provided.length === expected.length;
}
