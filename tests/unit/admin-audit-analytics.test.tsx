import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  analyticsGroups,
  isUtcDate,
  parseAnalyticsSummary,
  parseAuditPage,
  utcDateExclusiveEnd,
  validateAuditFilters,
} from '@admin/features/audit/domain';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireAdminActor: vi.fn() }));
vi.mock('@admin/lib/access', () => ({ requireAdminActor: mocks.requireAdminActor }));

import { GET, csvCell } from '@admin/app/[locale]/admin/audit/export/route';
import AnalyticsPage from '@admin/app/[locale]/admin/analytics/page';
import AuditPage from '@admin/app/[locale]/admin/audit/page';

const baseFilters = { actorId: '', targetType: '', targetId: '', action: '', from: '', to: '' };
const row = (id: string) => ({
  id,
  at: '2026-11-08T00:00:00.123456Z',
  actor_id: '123e4567-e89b-42d3-a456-426614174000',
  actor_role: 'system',
  action: 'group_deleted',
  target_type: 'group',
  target_id: null,
  request_id: null,
  metadata: { count: 1 },
});
const page = (rows: ReturnType<typeof row>[], next_cursor: { at: string; id: string } | null) => ({
  rows,
  next_cursor,
  snapshot_at: '2026-11-08T12:00:00.654321Z',
  total: 50000,
  total_capped: true,
});

describe('admin audit and analytics domain', () => {
  it('validates real dates deterministically and builds exclusive UTC bounds', () => {
    expect(isUtcDate('2000-02-29')).toBe(true);
    expect(isUtcDate('1900-02-29')).toBe(false);
    expect(isUtcDate('2026-02-30')).toBe(false);
    expect(utcDateExclusiveEnd('2024-02-29')).toBe('2024-02-29T00:00:00.000000Z');
    expect(validateAuditFilters({ ...baseFilters, from: '2026-01-01', to: '2026-01-01' })).toBe(
      'order',
    );
  });

  it('rejects invalid UUID and malformed dates without throwing', () => {
    expect(validateAuditFilters({ ...baseFilters, actorId: 'not-a-uuid' })).toBe('uuid');
    for (let index = 0; index < 100; index++) {
      const invalid = `${'x'.repeat(index)}-${'['.repeat(index % 9)}`;
      expect(() => isUtcDate(invalid)).not.toThrow();
      expect(isUtcDate(invalid)).toBe(false);
    }
  });

  it('accepts decimal-string cursors and the complete 23 metric keys in 12 UI groups', () => {
    expect(
      parseAuditPage(
        page([row('9223372036854775807')], {
          at: '2026-11-08T00:00:00.123456Z',
          id: '9223372036854775807',
        }),
      )?.rows[0].id,
    ).toBe('9223372036854775807');
    const allKeys = analyticsGroups.flat();
    expect(allKeys).toHaveLength(23);
    expect(analyticsGroups).toHaveLength(12);
    expect(
      parseAnalyticsSummary({
        window_days: 7,
        as_of: '2026-11-08T12:00:00Z',
        metrics: allKeys.map(key => ({
          key,
          value: 0,
          unit: 'count',
          status: 'ready',
          reason: null,
        })),
      })?.metrics,
    ).toHaveLength(23);
  });
});

describe('audit CSV route', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.requireAdminActor.mockReset().mockResolvedValue({ db: { rpc: mocks.rpc } });
  });

  it('escapes CSV quotes and protects formula-prefixed values', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(' =1+1')).toBe('"\' =1+1"');
  });

  it('rejects invalid filters before calling the RPC and requires the fresh admin actor', async () => {
    const response = await GET(
      new Request('https://admin.example/en/admin/audit/export?actor_id=nope'),
      { params: Promise.resolve({ locale: 'en' }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.requireAdminActor).toHaveBeenCalledWith('en');
    expect(mocks.rpc).not.toHaveBeenCalled();
    const duplicate = await GET(
      new Request('https://admin.example/en/admin/audit/export?from=2026-01-01&from=2026-02-01'),
      { params: Promise.resolve({ locale: 'en' }) },
    );
    expect(duplicate.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('passes the same midnight exclusive date bound to the page and export RPCs', async () => {
    mocks.rpc.mockResolvedValue({ data: page([], null), error: null });
    await AuditPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ from: '2024-02-28', to: '2024-02-29' }),
    });
    expect(mocks.rpc.mock.calls[0][1].p_to).toBe('2024-02-29T00:00:00.000000Z');

    mocks.rpc.mockReset().mockResolvedValue({ data: page([], null), error: null });
    await GET(
      new Request('https://admin.example/en/admin/audit/export?from=2024-02-28&to=2024-02-29'),
      { params: Promise.resolve({ locale: 'en' }) },
    );
    expect(mocks.rpc.mock.calls[0][1].p_to).toBe('2024-02-29T00:00:00.000000Z');
  });

  it('streams at most 50 pages (50,000 rows) and preserves the fixed cutoff and microsecond cursor', async () => {
    mocks.rpc.mockImplementation((_name: string, args: { p_before_id: string | null }) => {
      const index = args.p_before_id === null ? 0 : Number(args.p_before_id);
      return Promise.resolve({
        data: page(
          Array.from({ length: 1000 }, (_, i) => row(String(index * 1000 + i + 1))),
          index < 49
            ? {
                at: `2026-11-08T00:00:00.${String(123456 - index).padStart(6, '0')}Z`,
                id: String(index + 1),
              }
            : null,
        ),
        error: null,
      });
    });
    const response = await GET(new Request('https://admin.example/en/admin/audit/export'), {
      params: Promise.resolve({ locale: 'en' }),
    });
    const csv = await response.text();
    expect(csv.split('\r\n').length - 1).toBe(50001);
    expect(mocks.rpc).toHaveBeenCalledTimes(50);
    expect(mocks.rpc.mock.calls[1][1].p_before_at).toBe('2026-11-08T00:00:00.123456Z');
    expect(mocks.rpc.mock.calls[1][1].p_snapshot_at).toBe('2026-11-08T12:00:00.654321Z');
  });

  it('stops fetching after cancellation and errors the stream when a later page fails', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: page([row('1')], { at: '2026-11-08T00:00:00.123456Z', id: '1' }),
      error: null,
    });
    const cancelled = await GET(new Request('https://admin.example/en/admin/audit/export'), {
      params: Promise.resolve({ locale: 'en' }),
    });
    const reader = cancelled.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({
        data: page([row('1')], { at: '2026-11-08T00:00:00.123456Z', id: '1' }),
        error: null,
      })
      .mockRejectedValueOnce(new Error('db unavailable'));
    const failed = await GET(new Request('https://admin.example/en/admin/audit/export'), {
      params: Promise.resolve({ locale: 'en' }),
    });
    const failedReader = failed.body!.getReader();
    await failedReader.read();
    await expect(failedReader.read()).rejects.toThrow();
  });
});

describe('admin audit and analytics screens', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.requireAdminActor.mockReset().mockResolvedValue({ db: { rpc: mocks.rpc } });
  });

  it.each([
    { locale: 'en', audit: 'Audit log', analytics: 'Analytics' },
    { locale: 'ar', audit: 'سجل التدقيق', analytics: 'التحليلات' },
  ])('renders localized screens for $locale', async ({ locale, audit, analytics }) => {
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === 'admin_audit_page'
            ? page([row('23')], null)
            : {
                window_days: 7,
                as_of: '2026-11-08T12:00:00Z',
                metrics: analyticsGroups
                  .flat()
                  .map(key => ({ key, value: 0, unit: 'count', status: 'ready', reason: null })),
              },
        error: null,
      }),
    );
    const auditMarkup = renderToStaticMarkup(
      await AuditPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }),
    );
    const analyticsMarkup = renderToStaticMarkup(
      await AnalyticsPage({
        params: Promise.resolve({ locale }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(auditMarkup).toContain(audit);
    expect(auditMarkup).toContain(locale === 'ar' ? 'الفاعل' : 'Actor');
    expect(auditMarkup).toContain('123e4567-e89b-42d3-a456-426614174000');
    expect(analyticsMarkup).toContain(analytics);
    expect(analyticsMarkup).toContain(locale === 'ar' ? 'المؤشر' : 'Metric');
    expect(analyticsMarkup).toContain(
      locale === 'ar' ? 'أحدث محاولة مقدمة' : 'latest submitted attempt',
    );
    expect(analyticsMarkup).toContain(locale === 'ar' ? 'أيام UTC مكتملة' : 'complete UTC days');
    expect(auditMarkup).toContain(locale === 'ar' ? 'UTC' : 'From UTC date');
  });

  it('shows validation, authentication and load errors without exposing filter failures as empty data', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('read failure') });
    const invalidCursor = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ before_at: 'bad', before_id: '3' }),
      }),
    );
    expect(invalidCursor).toContain('page cursor is invalid');
    const failedAnalytics = renderToStaticMarkup(
      await AnalyticsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ days: '30' }),
      }),
    );
    expect(failedAnalytics).toContain('Could not load analytics');
    const invalidWindow = renderToStaticMarkup(
      await AnalyticsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ days: ['7', '30'] }),
      }),
    );
    expect(invalidWindow).toContain('Choose a 7 or 30 day window');
    mocks.requireAdminActor.mockRejectedValueOnce(new Error('MFA required'));
    await expect(
      AnalyticsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('MFA required');
  });
});
