export type TeacherAccessStatus = {
  has_access: boolean;
  starts_at: string | null;
  expires_at: string | null;
  renewal_opens_at: string | null;
  can_renew: boolean;
  fees_enabled: boolean;
  fee_effective_at: string | null;
  announcement_en: string | null;
  announcement_ar: string | null;
  pending_request_id: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instant = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullableInstant = (v: unknown): v is string | null => v === null || instant(v);
const nullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';
const nullableUuid = (v: unknown): v is string | null =>
  v === null || (typeof v === 'string' && uuid.test(v));
export type AdminAccessRow = {
  teacher_id: string;
  full_name: string;
  approved: boolean;
  has_access: boolean;
  expires_at: string | null;
  pending_request_id: string | null;
};
export type AdminAccessPolicy = {
  fees_enabled: boolean;
  effective_at: string | null;
  announcement_en: string | null;
  announcement_ar: string | null;
};
export type AdminAccessHistory = {
  grants: Array<{
    id: string;
    starts_at: string;
    expires_at: string;
    source: string;
    created_at: string;
  }>;
  requests: Array<{
    id: string;
    status: 'pending' | 'approved' | 'declined';
    created_at: string;
    decided_at: string | null;
  }>;
  total_grants: number;
  total_requests: number;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const safeCount = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function parseAdminAccessPage(
  v: unknown,
): { rows: AdminAccessRow[]; total: number; policy: AdminAccessPolicy } | null {
  if (
    !record(v) ||
    !Array.isArray(v.rows) ||
    v.rows.length > 20 ||
    !safeCount(v.total) ||
    !record(v.policy)
  )
    return null;
  const p = v.policy;
  if (
    typeof p.fees_enabled !== 'boolean' ||
    !nullableInstant(p.effective_at) ||
    !nullableString(p.announcement_en) ||
    !nullableString(p.announcement_ar)
  )
    return null;
  const rows = v.rows;
  if (
    !rows.every(
      x =>
        record(x) &&
        typeof x.teacher_id === 'string' &&
        uuid.test(x.teacher_id) &&
        typeof x.full_name === 'string' &&
        typeof x.approved === 'boolean' &&
        typeof x.has_access === 'boolean' &&
        nullableInstant(x.expires_at) &&
        nullableUuid(x.pending_request_id),
    )
  )
    return null;
  return { rows: rows as AdminAccessRow[], total: v.total, policy: p as AdminAccessPolicy };
}
export function parseAdminAccessHistory(v: unknown): AdminAccessHistory | null {
  if (
    !record(v) ||
    !Array.isArray(v.grants) ||
    !Array.isArray(v.requests) ||
    !safeCount(v.total_grants) ||
    !safeCount(v.total_requests) ||
    v.grants.length > 20 ||
    v.requests.length > 20
  )
    return null;
  const grants = v.grants,
    requests = v.requests;
  if (
    !grants.every(
      x =>
        record(x) &&
        typeof x.id === 'string' &&
        uuid.test(x.id) &&
        instant(x.starts_at) &&
        instant(x.expires_at) &&
        ['signup', 'backfill', 'free_renewal', 'admin_approved'].includes(String(x.source)) &&
        instant(x.created_at),
    )
  )
    return null;
  if (
    !requests.every(
      x =>
        record(x) &&
        typeof x.id === 'string' &&
        uuid.test(x.id) &&
        ['pending', 'approved', 'declined'].includes(String(x.status)) &&
        instant(x.created_at) &&
        nullableInstant(x.decided_at),
    )
  )
    return null;
  return {
    grants: grants as AdminAccessHistory['grants'],
    requests: requests as AdminAccessHistory['requests'],
    total_grants: v.total_grants,
    total_requests: v.total_requests,
  };
}
export function parseTeacherAccessStatus(value: unknown): TeacherAccessStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.has_access !== 'boolean' ||
    typeof v.can_renew !== 'boolean' ||
    typeof v.fees_enabled !== 'boolean' ||
    !nullableInstant(v.starts_at) ||
    !nullableInstant(v.expires_at) ||
    !nullableInstant(v.renewal_opens_at) ||
    !nullableInstant(v.fee_effective_at) ||
    !nullableUuid(v.pending_request_id) ||
    !nullableString(v.announcement_en) ||
    !nullableString(v.announcement_ar)
  )
    return null;
  // Open-ended access is valid for the launch free phase; a paid access grant must still have a start.
  if (v.has_access && !instant(v.starts_at)) return null;
  return {
    has_access: v.has_access,
    starts_at: v.starts_at,
    expires_at: v.expires_at,
    renewal_opens_at: v.renewal_opens_at,
    can_renew: v.can_renew,
    fees_enabled: v.fees_enabled,
    fee_effective_at: v.fee_effective_at,
    announcement_en: v.announcement_en,
    announcement_ar: v.announcement_ar,
    pending_request_id: v.pending_request_id,
  };
}
export type RenewalResult = {
  outcome: 'renewed' | 'requested' | 'pending' | 'too_early';
  access: TeacherAccessStatus;
  request_id: string | null;
};
export function parseRenewalResult(value: unknown): RenewalResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>,
    access = parseTeacherAccessStatus(v.access);
  if (
    !access ||
    !['renewed', 'requested', 'pending', 'too_early'].includes(String(v.outcome)) ||
    !nullableUuid(v.request_id)
  )
    return null;
  const outcome = v.outcome;
  if (
    outcome !== 'renewed' &&
    outcome !== 'requested' &&
    outcome !== 'pending' &&
    outcome !== 'too_early'
  )
    return null;
  return { outcome, access, request_id: v.request_id };
}
export function cairoDateTime(value: string | null, locale: string) {
  if (!value || !instant(value)) return null;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}
export function cairoLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number),
    [y, m, d, h, min] = parts;
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const v = Object.fromEntries(formatted.map(p => [p.type, p.value]));
    const represented = Date.UTC(
      Number(v.year),
      Number(v.month) - 1,
      Number(v.day),
      Number(v.hour),
      Number(v.minute),
    );
    guess += Date.UTC(y, m - 1, d, h, min) - represented;
  }
  if (!Number.isFinite(guess)) return null;
  const check = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const formatted = Object.fromEntries(check.map(p => [p.type, p.value]));
  if (
    Number(formatted.year) !== y ||
    Number(formatted.month) !== m ||
    Number(formatted.day) !== d ||
    Number(formatted.hour) !== h ||
    Number(formatted.minute) !== min
  )
    return null;
  return new Date(guess).toISOString();
}
