import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRequestViewer: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));

import { teacherRequests } from '@/features/teacher/data';

describe('teacher enrollment page loader', () => {
  beforeEach(() => mocks.getRequestViewer.mockReset());

  function viewer(rpc: ReturnType<typeof vi.fn>) {
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { headline: '', bio: '', approved: true }, error: null }) }) }),
      }),
      rpc,
    };
    mocks.getRequestViewer.mockResolvedValue({
      db, user: { id: 'teacher' }, profile: { id: 'teacher', role: 'teacher', status: 'active' },
    });
  }

  it('requests the selected page directly in one RPC call', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { rows: [], total: 43 }, error: null });
    viewer(rpc);
    const result = await teacherRequests('en', '2');
    expect(result.page).toBe(2);
    expect(result.total).toBe(43);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('teacher_enrollment_page', { p_status: 'pending', p_offset: 20, p_limit: 20 });
  });

  it('clamps an out of range page and retries only the clamped offset', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { rows: [], total: 21 }, error: null })
      .mockResolvedValueOnce({ data: { rows: [{ enrollment_id: 'last' }], total: 21 }, error: null });
    viewer(rpc);
    const result = await teacherRequests('en', '9');
    expect(result.page).toBe(2);
    expect(result.requests).toEqual([{ enrollment_id: 'last' }]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(call => call[1].p_offset)).toEqual([160, 20]);
  });
});
