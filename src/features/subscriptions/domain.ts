export type TeacherPlanStatus = {
  plan_code: 'free' | 'standard' | 'pro';
  plan_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  updated_version: number;
  quotas_enabled: boolean;
  quotas_effective_at: string | null;
  active_groups: number;
  stored_files: number;
  stored_bytes: number;
  limits: Record<string, unknown>;
};

const finiteCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validDateOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));

export function parseTeacherPlanStatus(value: unknown): TeacherPlanStatus | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const data = row as Record<string, unknown>;
  const limits = data.limits;
  if (
    !['free', 'standard', 'pro'].includes(String(data.plan_code)) ||
    typeof data.plan_active !== 'boolean' ||
    !validDateOrNull(data.starts_at) ||
    !validDateOrNull(data.expires_at) ||
    !finiteCount(data.updated_version) ||
    typeof data.quotas_enabled !== 'boolean' ||
    !validDateOrNull(data.quotas_effective_at) ||
    !finiteCount(data.active_groups) ||
    !finiteCount(data.stored_files) ||
    !finiteCount(data.stored_bytes) ||
    !limits ||
    typeof limits !== 'object' ||
    Array.isArray(limits) ||
    !finiteCount((limits as Record<string, unknown>).groups) ||
    !finiteCount((limits as Record<string, unknown>).files) ||
    !finiteCount((limits as Record<string, unknown>).bytes) ||
    !finiteCount((limits as Record<string, unknown>).file_bytes)
  )
    return null;
  return data as TeacherPlanStatus;
}

export function parseTransactionReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length >= 4 && normalized.length <= 120 ? normalized : null;
}

export function parsePlanAssignmentInput(input: {
  plan: unknown;
  version: unknown;
  reference: unknown;
  bankChecked: unknown;
}) {
  const reference = parseTransactionReference(input.reference);
  const version =
    typeof input.version === 'string' && /^(0|[1-9]\d{0,14})$/.test(input.version)
      ? Number(input.version)
      : NaN;
  if (
    !['standard', 'pro'].includes(String(input.plan)) ||
    !Number.isSafeInteger(version) ||
    !reference ||
    input.bankChecked !== 'on'
  )
    return null;
  return { plan: input.plan as 'standard' | 'pro', version, reference };
}

export function canAssignPlan(status: TeacherPlanStatus, now = Date.now()): boolean {
  return (
    status.quotas_enabled &&
    !!status.quotas_effective_at &&
    Date.parse(status.quotas_effective_at) <= now
  );
}
