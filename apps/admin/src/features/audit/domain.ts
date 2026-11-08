export type AuditFilters = {
  actorId: string;
  targetType: string;
  targetId: string;
  action: string;
  from: string;
  to: string;
};

export type AuditRow = {
  id: string;
  at: string;
  actor_id: string | null;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
};

export type AuditCursor = { at: string; id: string };
export type AuditPage = {
  rows: AuditRow[];
  next_cursor: AuditCursor | null;
  snapshot_at: string;
  total: number;
  total_capped: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export const auditTargetTypes = [
  'teacher',
  'teacher_application',
  'teacher_access_request',
  'fee_policy',
  'quota_policy',
  'user',
  'feedback',
  'feedback_reply',
  'report',
  'group',
  'account',
  'teacher_plan',
  'audit_log',
] as const;
export const auditActions = [
  'teacher_review_approved',
  'teacher_review_declined',
  'teacher_application_changes_requested',
  'teacher_access_approved',
  'teacher_access_declined',
  'fee_policy_changed',
  'quota_policy_changed',
  'user_suspended',
  'user_reactivated',
  'admin_granted',
  'admin_revoked',
  'feedback_approved',
  'feedback_hidden',
  'feedback_reply_approved',
  'feedback_reply_hidden',
  'report_resolved',
  'report_reopened',
  'group_archived',
  'group_deleted',
  'account_deletion_started',
  'account_deletion_completed',
  'teacher_plan_assigned',
  'audit_purged',
] as const;

function isPositivePgId(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) return false;
  const parsed = BigInt(value);
  return parsed > BigInt(0) && parsed <= BigInt('9223372036854775807');
}

export function isUuid(value: string): boolean {
  return value.length === 36 && uuidPattern.test(value);
}

/** Parse a real YYYY-MM-DD calendar date without relying on permissive JS date parsing. */
export function isUtcDate(value: string): boolean {
  const match = datePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1];
}

export function isUtcTimestamp(value: string): boolean {
  if (value.length < 20 || value.length > 32) return false;
  const separator = value.indexOf('T');
  if (separator !== 10 || value.indexOf('T', separator + 1) !== -1) return false;
  const date = value.slice(0, separator);
  let clock = value.slice(separator + 1);
  if (!isUtcDate(date)) return false;
  if (clock.endsWith('+00:00')) clock = clock.slice(0, -6);
  else if (clock.endsWith('Z')) clock = clock.slice(0, -1);
  else return false;
  const timeParts = clock.split(':');
  if (timeParts.length !== 3) return false;
  const [hour, minute, secondAndFraction] = timeParts;
  if (hour.length !== 2 || minute.length !== 2 || Number(hour) > 23 || Number(minute) > 59)
    return false;
  const dot = secondAndFraction.indexOf('.');
  const second = dot === -1 ? secondAndFraction : secondAndFraction.slice(0, dot);
  if (second.length !== 2 || Number(second) > 59) return false;
  if (dot !== -1) {
    const fraction = secondAndFraction.slice(dot + 1);
    if (fraction.length < 1 || fraction.length > 6) return false;
    for (const character of fraction) if (character < '0' || character > '9') return false;
  }
  return [...hour, ...minute, ...second].every(character => character >= '0' && character <= '9');
}

export function validateAuditFilters(filters: AuditFilters): string | null {
  for (const value of [filters.actorId, filters.targetId]) {
    if (value && !isUuid(value)) return 'uuid';
  }
  if (filters.action.length > 80 || filters.targetType.length > 80) return 'length';
  if (filters.action && !auditActions.includes(filters.action as (typeof auditActions)[number]))
    return 'action';
  if (
    filters.targetType &&
    !auditTargetTypes.includes(filters.targetType as (typeof auditTargetTypes)[number])
  )
    return 'target_type';
  if (filters.from && !isUtcDate(filters.from)) return 'from';
  if (filters.to && !isUtcDate(filters.to)) return 'to';
  if (filters.from && filters.to && filters.from >= filters.to) return 'order';
  return null;
}

export function utcDateStart(value: string): string {
  return `${value}T00:00:00.000000Z`;
}

/** Convert the exclusive DATE bound directly to deterministic UTC midnight. */
export function utcDateExclusiveEnd(value: string): string {
  return isUtcDate(value) ? `${value}T00:00:00.000000Z` : '';
}

export function parseAuditPage(value: unknown): AuditPage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<AuditPage>;
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > 1000 ||
    typeof data.snapshot_at !== 'string' ||
    !isUtcTimestamp(data.snapshot_at) ||
    !Number.isSafeInteger(data.total) ||
    typeof data.total_capped !== 'boolean' ||
    !(
      data.next_cursor === null ||
      (typeof data.next_cursor === 'object' && data.next_cursor !== null)
    )
  )
    return null;
  if (
    data.next_cursor &&
    (typeof data.next_cursor.at !== 'string' ||
      !isUtcTimestamp(data.next_cursor.at) ||
      !isPositivePgId(data.next_cursor.id))
  )
    return null;
  for (const candidate of data.rows) {
    if (!candidate || typeof candidate !== 'object') return null;
    const row = candidate as Partial<AuditRow>;
    if (
      !isPositivePgId(row.id) ||
      typeof row.at !== 'string' ||
      !isUtcTimestamp(row.at) ||
      typeof row.actor_role !== 'string' ||
      typeof row.action !== 'string' ||
      typeof row.target_type !== 'string' ||
      !(row.actor_id === null || typeof row.actor_id === 'string') ||
      !(row.target_id === null || typeof row.target_id === 'string') ||
      !(row.request_id === null || typeof row.request_id === 'string') ||
      !row.metadata ||
      typeof row.metadata !== 'object' ||
      Array.isArray(row.metadata)
    )
      return null;
  }
  return data as AuditPage;
}

export const analyticsGroups = [
  [
    'registrations_students',
    'registrations_teachers',
    'registrations_admins',
    'email_verification_rate',
  ],
  [
    'teacher_app_submitted',
    'teacher_app_approved',
    'teacher_app_approval_rate',
    'teacher_app_median_hours',
  ],
  ['published_groups'],
  ['enrollment_pending', 'enrollment_accepted', 'enrollment_acceptance_rate'],
  ['waitlist_size'],
  ['lessons_scheduled', 'lessons_completed', 'lessons_cancelled'],
  ['attendance_rate'],
  ['sandak_requests'],
  ['sandak_quota_hits'],
  ['sandak_errors'],
  ['email_outbox_queued', 'email_outbox_failed'],
  ['push_delivery'],
] as const;

export type AnalyticsMetric = {
  key: string;
  value: number | null;
  unit: 'count' | 'percent' | 'hours';
  status: 'ready' | 'unavailable';
  reason: string | null;
};

export type AnalyticsSummary = {
  window_days: 7 | 30;
  as_of: string;
  metrics: AnalyticsMetric[];
};

export function parseAnalyticsSummary(value: unknown): AnalyticsSummary | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<AnalyticsSummary>;
  const expectedKeys: readonly string[] = analyticsGroups.flat();
  if (
    (data.window_days !== 7 && data.window_days !== 30) ||
    typeof data.as_of !== 'string' ||
    !Array.isArray(data.metrics) ||
    data.metrics.length !== expectedKeys.length
  )
    return null;
  const seen = new Set<string>();
  for (const candidate of data.metrics) {
    if (!candidate || typeof candidate !== 'object') return null;
    const metric = candidate as Partial<AnalyticsMetric>;
    if (
      typeof metric.key !== 'string' ||
      !expectedKeys.includes(metric.key) ||
      seen.has(metric.key) ||
      !['count', 'percent', 'hours'].includes(metric.unit ?? '') ||
      (metric.status !== 'ready' && metric.status !== 'unavailable') ||
      !(
        metric.value === null ||
        (typeof metric.value === 'number' && Number.isFinite(metric.value))
      ) ||
      !(
        metric.reason === null ||
        metric.reason === 'no_data' ||
        metric.reason === 'not_instrumented' ||
        metric.reason === 'not_enabled'
      )
    )
      return null;
    if (metric.status === 'ready' && (metric.value === null || metric.reason !== null)) return null;
    if (metric.status === 'unavailable' && (metric.value !== null || metric.reason === null))
      return null;
    seen.add(metric.key);
  }
  return data as AnalyticsSummary;
}
