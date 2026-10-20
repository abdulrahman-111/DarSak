import { beforeEach, describe, expect, it, vi } from 'vitest';
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import {
  cairoDateTime,
  cairoLocalToIso,
  parseAdminAccessHistory,
  parseAdminAccessPage,
  parseRenewalResult,
  parseTeacherAccessStatus,
} from '@/features/teacher-access/domain';
import { renewTeacherAccess } from '@/features/teacher-access/actions';
import { saveTeacherFeePolicy } from '@/features/teacher-access/admin-actions';
const id = '12ab34cd-12ab-42cd-82ab-12ab34cd56ef';
const status = (overrides: Record<string, unknown> = {}) => ({
  has_access: false,
  starts_at: null,
  expires_at: null,
  renewal_opens_at: null,
  can_renew: true,
  fees_enabled: false,
  fee_effective_at: null,
  announcement_en: null,
  announcement_ar: null,
  pending_request_id: null,
  ...overrides,
});
describe('monthly teacher access contracts', () => {
  beforeEach(() => createClient.mockReset());
  it('treats missing grants as denied and accepts current and expired periods without changing their start', () => {
    expect(parseTeacherAccessStatus(status())?.has_access).toBe(false);
    expect(
      parseTeacherAccessStatus(
        status({
          has_access: true,
          starts_at: '2026-01-31T22:00:00Z',
          expires_at: '2026-02-28T22:00:00Z',
        }),
      )?.starts_at,
    ).toBe('2026-01-31T22:00:00Z');
    expect(
      parseTeacherAccessStatus(
        status({ has_access: true, starts_at: '2026-01-31T22:00:00Z', expires_at: null }),
      )?.expires_at,
    ).toBeNull();
    expect(
      parseTeacherAccessStatus(
        status({ has_access: true, starts_at: '2026-01-31T22:00:00Z', expires_at: 'invalid' }),
      ),
    ).toBeNull();
    expect(
      parseTeacherAccessStatus(
        status({
          has_access: false,
          starts_at: '2026-01-31T22:00:00Z',
          expires_at: '2026-02-28T22:00:00Z',
          can_renew: true,
        }),
      ),
    ).not.toBeNull();
  });
  it('rejects malformed status and does not treat a future fee policy as immediately effective', () => {
    expect(parseTeacherAccessStatus({ ...status(), has_access: 'false' })).toBeNull();
    const future = parseTeacherAccessStatus(
      status({ fees_enabled: true, fee_effective_at: '2099-01-01T00:00:00Z' }),
    );
    expect(future?.fees_enabled).toBe(true);
    expect(Date.parse(future!.fee_effective_at!)).toBeGreaterThan(Date.now());
  });
  it('parses pending, early, requested, renewed, and malformed renewal outcomes', () => {
    const access = parseTeacherAccessStatus(status())!;
    for (const outcome of ['requested', 'pending', 'too_early', 'renewed'])
      expect(
        parseRenewalResult({ outcome, access, request_id: outcome === 'renewed' ? null : id })
          ?.outcome,
      ).toBe(outcome);
    expect(parseRenewalResult({ outcome: 'paid', access, request_id: null })).toBeNull();
  });
  it('validates bounded admin page and history payloads with UUIDs, statuses, and finite dates', () => {
    const row = {
      teacher_id: id,
      full_name: 'Teacher',
      approved: false,
      has_access: false,
      expires_at: null,
      pending_request_id: null,
    };
    expect(
      parseAdminAccessPage({
        rows: [row],
        total: 1,
        policy: {
          fees_enabled: false,
          effective_at: null,
          announcement_en: null,
          announcement_ar: null,
        },
      })?.rows,
    ).toHaveLength(1);
    expect(
      parseAdminAccessPage({
        rows: [{ ...row, teacher_id: 'broken' }],
        total: 1,
        policy: {
          fees_enabled: false,
          effective_at: null,
          announcement_en: null,
          announcement_ar: null,
        },
      }),
    ).toBeNull();
    expect(
      parseAdminAccessPage({
        rows: Array(21).fill(row),
        total: 21,
        policy: {
          fees_enabled: false,
          effective_at: null,
          announcement_en: null,
          announcement_ar: null,
        },
      }),
    ).toBeNull();
    const grant = {
      id,
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-02-01T00:00:00Z',
      source: 'signup',
      created_at: '2026-01-01T00:00:00Z',
    };
    const request = { id, status: 'pending', created_at: '2026-01-01T00:00:00Z', decided_at: null };
    expect(
      parseAdminAccessHistory({
        grants: [grant],
        requests: [request],
        total_grants: 1,
        total_requests: 1,
      })?.total_requests,
    ).toBe(1);
    expect(
      parseAdminAccessHistory({
        grants: [{ ...grant, starts_at: 'bad' }],
        requests: [],
        total_grants: 1,
        total_requests: 0,
      }),
    ).toBeNull();
    expect(
      parseAdminAccessHistory({
        grants: [],
        requests: [{ ...request, status: 'unknown' }],
        total_grants: 0,
        total_requests: 1,
      }),
    ).toBeNull();
  });
  it('formats Cairo time and converts local Cairo form values across DST', () => {
    expect(cairoDateTime('2026-05-01T10:00:00Z', 'en')).toContain('13:00');
    const iso = cairoLocalToIso('2026-04-25T12:00');
    expect(iso).not.toBeNull();
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(iso!)),
    ).toBe('12:00');
    expect(cairoLocalToIso('bad')).toBeNull();
  });
  it('describes paid review differently for expired and still-current access', async () => {
    const access = parseTeacherAccessStatus(status({ pending_request_id: id }))!;
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: 'teacher', status: 'active' } }),
          }),
        }),
      }),
      rpc: async () => ({ data: { outcome: 'requested', access, request_id: id }, error: null }),
    });
    const expired = await renewTeacherAccess('en', null, new FormData());
    expect(expired?.success).toContain('Teaching remains paused');
    expect(expired?.success).not.toContain('current access remains active');
    const current = {
      ...access,
      has_access: true,
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2027-01-01T00:00:00Z',
    };
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: 'teacher', status: 'active' } }),
          }),
        }),
      }),
      rpc: async () => ({
        data: { outcome: 'requested', access: current, request_id: id },
        error: null,
      }),
    });
    const active = await renewTeacherAccess('en', null, new FormData());
    expect(active?.success).toContain('current access remains active');
  });
  it('requires explicit confirmation before the admin fee policy RPC', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { role: 'admin', status: 'active' } }) }),
        }),
      }),
      rpc,
    });
    const unconfirmed = new FormData();
    expect((await saveTeacherFeePolicy('ar', null, unconfirmed))?.error).toContain(
      'أكد تغيير السياسة',
    );
    expect(rpc).not.toHaveBeenCalled();
    const confirmed = new FormData();
    confirmed.set('confirm', 'on');
    expect((await saveTeacherFeePolicy('en', null, confirmed))?.success).toContain('No charges');
    expect(rpc).toHaveBeenCalledWith('set_teacher_access_fee_policy', {
      p_enabled: false,
      p_effective_at: null,
      p_announcement_en: null,
      p_announcement_ar: null,
      p_confirm: true,
    });
  });
});
