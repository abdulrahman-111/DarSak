export type Claims = Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function decodeJwtPayload(token: string): Claims | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const bytes = Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(value) ? value : null;
  } catch { return null; }
}

export function oauthAmrTimestamp(payload: Claims): number | null {
  if (!Array.isArray(payload.amr)) return null;
  for (const entry of payload.amr) {
    if (!isRecord(entry) || entry.method !== 'oauth') continue;
    const raw = entry.timestamp;
    const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Date.parse(raw) / 1000 : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function isFreshOauthProof(payload: Claims, nowSeconds: number, maxAgeSeconds = 300, futureSkewSeconds = 60): boolean {
  const timestamp = oauthAmrTimestamp(payload);
  return timestamp !== null && timestamp <= nowSeconds + futureSkewSeconds && nowSeconds - timestamp <= maxAgeSeconds;
}
