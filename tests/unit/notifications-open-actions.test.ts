import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestViewer: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { openNotification } from '@/features/notifications/actions';

const viewerId = '11111111-1111-4111-8111-111111111111';
const notificationId = '22222222-2222-4222-8222-222222222222';
const lessonId = '33333333-3333-4333-8333-333333333333';

function setup({
  row = {
    recipient_id: viewerId,
    kind: 'lesson_rescheduled',
    payload: { lesson_id: lessonId },
  },
  rowError = null,
  rpcError = null,
  user = { id: viewerId },
  profile = { id: viewerId, role: 'student', status: 'active' },
}: {
  row?: Record<string, unknown> | null;
  rowError?: { message: string } | null;
  rpcError?: { message: string } | null;
  user?: { id: string } | null;
  profile?: { id: string; role: string; status: string } | null;
} = {}) {
  const events: string[] = [];
  const rpc = vi.fn(async () => {
    events.push('rpc');
    return { error: rpcError };
  });
  const maybeSingle = vi.fn(async () => ({ data: row, error: rowError }));
  const query = { maybeSingle, eq: vi.fn() };
  const eq = query.eq.mockReturnValue(query);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  mocks.getRequestViewer.mockResolvedValue({
    db: { from, rpc },
    user,
    profile,
  });
  mocks.redirect.mockImplementation((href: string) => {
    events.push('redirect');
    throw new Error(`redirect:${href}`);
  });
  return { events, from, select, eq, maybeSingle, rpc };
}

const formData = new FormData();

describe('openNotification server action', () => {
  beforeEach(() => {
    mocks.getRequestViewer.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.redirect.mockReset();
  });

  it('marks an owned actionable notification read before redirecting to its server-derived route', async () => {
    const { events, from, select, eq, maybeSingle, rpc } = setup();
    await expect(openNotification('en', notificationId, null, formData)).rejects.toThrow(
      `redirect:/en/student/lessons/${lessonId}`,
    );

    expect(from).toHaveBeenCalledWith('user_notifications');
    expect(select).toHaveBeenCalledWith('recipient_id,kind,payload');
    expect(eq).toHaveBeenNthCalledWith(1, 'id', notificationId);
    expect(eq).toHaveBeenNthCalledWith(2, 'recipient_id', viewerId);
    expect(maybeSingle).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('mark_notification_read', { p_id: notificationId });
    expect(events).toEqual(['rpc', 'redirect']);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/notifications');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en', 'layout');
  });

  it('rejects missing authentication, inactive profiles, and rows not owned by the viewer', async () => {
    setup({ user: null });
    expect((await openNotification('en', notificationId, null, formData))?.error).toBeTruthy();

    setup({ profile: { id: viewerId, role: 'student', status: 'suspended' } });
    expect((await openNotification('en', notificationId, null, formData))?.error).toBeTruthy();

    const { rpc } = setup({
      row: {
        recipient_id: '44444444-4444-4444-8444-444444444444',
        kind: 'lesson_rescheduled',
        payload: { lesson_id: lessonId },
      },
    });
    expect((await openNotification('en', notificationId, null, formData))?.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid locale or ID before loading the viewer', async () => {
    expect((await openNotification('fr', notificationId, null, formData))?.error).toBeTruthy();
    expect((await openNotification('en', 'bad-id', null, formData))?.error).toBeTruthy();
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
  });

  it('rejects missing rows and untrusted destinations without marking them read', async () => {
    const missing = setup({ row: null });
    expect((await openNotification('en', notificationId, null, formData))?.error).toBeTruthy();
    expect(missing.rpc).not.toHaveBeenCalled();

    const invalidDestination = setup({
      row: {
        recipient_id: viewerId,
        kind: 'lesson_rescheduled',
        payload: { lesson_id: 'javascript:alert(1)' },
      },
    });
    expect((await openNotification('en', notificationId, null, formData))?.error).toBeTruthy();
    expect(invalidDestination.rpc).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('shows retry feedback and stays on the page when the read RPC fails', async () => {
    const { rpc } = setup({ rpcError: { message: 'database unavailable' } });
    const result = await openNotification('en', notificationId, null, formData);

    expect(result?.error).toMatch(/could not open/i);
    expect(rpc).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns localized retry feedback when authentication, lookup, or RPC calls throw', async () => {
    mocks.getRequestViewer.mockRejectedValueOnce(new Error('auth transport failed'));
    expect((await openNotification('en', notificationId, null, formData))?.error).toMatch(
      /could not open/i,
    );

    const lookup = setup();
    lookup.maybeSingle.mockRejectedValueOnce(new Error('query transport failed'));
    expect((await openNotification('en', notificationId, null, formData))?.error).toMatch(
      /could not open/i,
    );

    const rpc = setup();
    rpc.rpc.mockRejectedValueOnce(new Error('rpc transport failed'));
    expect((await openNotification('ar', notificationId, null, formData))?.error).toMatch(
      /تعذر فتح الإشعار/,
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('supports repeated opens because the database read RPC is idempotent', async () => {
    const { rpc } = setup();
    await expect(openNotification('en', notificationId, null, formData)).rejects.toThrow(
      'redirect:',
    );
    await expect(openNotification('en', notificationId, null, formData)).rejects.toThrow(
      'redirect:',
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
