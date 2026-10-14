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

  it('requests the selected filtered page and bounded group choices', async () => {
    const rpc = vi.fn((name: string, _args?: Record<string, unknown>) => Promise.resolve({ data: name === 'teacher_group_choices' ? [] : { rows: [], total: 43 }, error: null }));
    viewer(rpc);
    const result = await teacherRequests('en', '2', '  Maha ', '7e100000-0000-4000-8000-000000000001');
    expect(result.page).toBe(2);
    expect(result.total).toBe(43);
    expect(result.query).toBe('Maha');
    expect(result.groupId).toBe('7e100000-0000-4000-8000-000000000001');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('teacher_enrollment_search', { p_status: 'pending', p_query: 'Maha', p_group_id: '7e100000-0000-4000-8000-000000000001', p_offset: 20, p_limit: 20 });
    expect(rpc).toHaveBeenCalledWith('teacher_group_choices', { p_query: 'Maha', p_selected: '7e100000-0000-4000-8000-000000000001' });
  });

  it('clamps an out of range page and retries only the clamped offset', async () => {
    let pageCalls = 0;
    const rpc = vi.fn((name: string, _args?: Record<string, unknown>) => {
      if (name === 'teacher_group_choices') return Promise.resolve({ data: [], error: null });
      pageCalls += 1;
      return Promise.resolve({ data: { rows: pageCalls === 1 ? [] : [{ enrollment_id: 'last' }], total: 21 }, error: null });
    });
    viewer(rpc);
    const result = await teacherRequests('en', '9');
    expect(result.page).toBe(2);
    expect(result.requests).toEqual([{ enrollment_id: 'last' }]);
    expect(rpc.mock.calls.filter(call => call[0] === 'teacher_enrollment_search').map(call => call[1]?.p_offset)).toEqual([160, 20]);
  });
});
