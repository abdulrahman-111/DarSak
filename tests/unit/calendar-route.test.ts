import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getRequestViewer } = vi.hoisted(() => ({ getRequestViewer: vi.fn() }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer }));

import { GET } from '@/app/api/calendar/route';

const request = (query = 'from=2026-01-01&until=2026-01-31&locale=en') => new NextRequest(`https://dars.example/api/calendar?${query}`);

describe('calendar route', () => {
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: { total: 0, rows: [] }, error: null });
    getRequestViewer.mockReset().mockResolvedValue({ db: { rpc }, user: { id: 'user' }, profile: { role: 'student', status: 'active' } });
  });

  it('returns a private attachment for active viewers', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('attachment; filename="dars-lessons-2026-01-01-to-2026-01-31.ics"');
    expect(rpc).toHaveBeenCalledWith('calendar_lesson_export', { p_from: '2026-01-01', p_until: '2026-01-31' });
  });

  it('returns private 401/403 responses for missing, inactive, or disallowed viewers', async () => {
    getRequestViewer.mockResolvedValueOnce({ db: { rpc }, user: null, profile: null });
    const unauthenticated = await GET(request());
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get('cache-control')).toBe('private, no-store');

    getRequestViewer.mockResolvedValueOnce({ db: { rpc }, user: { id: 'user' }, profile: { role: 'student', status: 'inactive' } });
    expect((await GET(request())).status).toBe(403);
    getRequestViewer.mockResolvedValueOnce({ db: { rpc }, user: { id: 'user' }, profile: { role: 'admin', status: 'active' } });
    expect((await GET(request())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid and oversized ranges and hides RPC errors', async () => {
    const invalid = await GET(request('from=2026-02-30&until=2026-03-01&locale=en'));
    expect(invalid.status).toBe(400);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '54000', message: 'limit' } });
    const tooMany = await GET(request());
    expect(tooMany.status).toBe(400);
    expect(await tooMany.json()).toEqual({ error: 'too_many_lessons' });
    rpc.mockResolvedValueOnce({ data: { total: 1, rows: [] }, error: null });
    expect((await GET(request())).status).toBe(500);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } });
    const failure = await GET(request());
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain('private database detail');
  });
});
