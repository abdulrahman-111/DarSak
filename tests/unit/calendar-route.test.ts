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

  it('maps the exact expired-teacher RPC denial to private 403 while student export remains intact', async () => {
    getRequestViewer.mockResolvedValueOnce({ db: { rpc }, user: { id: 'teacher' }, profile: { role: 'teacher', status: 'active' } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'teacher teaching access expired' } });
    const expired=await GET(request());
    expect(expired.status).toBe(403);expect(expired.headers.get('cache-control')).toBe('private, no-store');
    expect(await expired.json()).toEqual({error:'teaching_access_expired'});
    getRequestViewer.mockResolvedValueOnce({ db: { rpc }, user: { id: 'student' }, profile: { role: 'student', status: 'active' } });
    rpc.mockResolvedValueOnce({data:{total:0,rows:[]},error:null});
    expect(await GET(request()).then(r=>r.status)).toBe(200);
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
