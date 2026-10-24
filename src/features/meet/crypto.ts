import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type EncryptedSecret = string;

function decodeKey(keyBase64: string): Buffer {
  if (
    typeof keyBase64 !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(keyBase64)
  ) {
    throw new Error('Invalid Meet encryption key.');
  }
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== keyBase64) {
    throw new Error('Invalid Meet encryption key.');
  }
  return key;
}

function associatedData(value: string): Buffer {
  if (!value || value.length > 2048) throw new Error('Invalid Meet encryption context.');
  return Buffer.from(value, 'utf8');
}

export function encryptSecret(plaintext: string, keyBase64: string, aad: string): EncryptedSecret {
  if (typeof plaintext !== 'string' || plaintext.length === 0)
    throw new Error('Invalid Meet token.');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(keyBase64), iv);
  cipher.setAAD(associatedData(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptSecret(encrypted: EncryptedSecret, keyBase64: string, aad: string): string {
  try {
    const parts = encrypted.split('.');
    if (
      parts.length !== 4 ||
      parts[0] !== 'v1' ||
      parts.slice(1).some(part => !/^[A-Za-z0-9_-]+$/.test(part))
    )
      throw new Error();
    const iv = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0)
      throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', decodeKey(keyBase64), iv);
    decipher.setAAD(associatedData(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt Meet secret.');
  }
}

export function tokenAssociatedData(
  teacherId: string,
  googleSubject: string,
  keyVersion: number,
): string {
  if (!teacherId || !googleSubject || !Number.isSafeInteger(keyVersion) || keyVersion < 1)
    throw new Error('Invalid Meet token identity.');
  return JSON.stringify(['darsak-meet-token', 1, teacherId, googleSubject, keyVersion]);
}

export function encryptToken(
  plaintext: string,
  keyBase64: string,
  teacherId: string,
  googleSubject: string,
  keyVersion: number,
): EncryptedSecret {
  return encryptSecret(
    plaintext,
    keyBase64,
    tokenAssociatedData(teacherId, googleSubject, keyVersion),
  );
}

export function decryptToken(
  encrypted: EncryptedSecret,
  keyBase64: string,
  teacherId: string,
  googleSubject: string,
  keyVersion: number,
): string {
  return decryptSecret(
    encrypted,
    keyBase64,
    tokenAssociatedData(teacherId, googleSubject, keyVersion),
  );
}

export function createOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function createPkceVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function createPkceChallenge(verifier: string): string {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new Error('Invalid PKCE verifier.');
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
