import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), flush: vi.fn(), after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/features/email/worker', () => ({ flushEmailOutbox: mocks.flush }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw Object.assign(new Error('redirect'), { location });
  },
}));
import { retryEmailJob } from '@/features/email/admin-actions';

const id = '5a4c7d3e-1f2a-4b67-8c90-123456789abc';
function database(role: string, status = 'active') {
  const rpc = vi.fn(async (_name: string, _args?: unknown) => ({
    data: null as unknown,
    error: null as null | { message: string },
  }));
  return {
    rpc,
    client: {
      auth: { getUser: async () => ({ data: { user: { id: 'admin-id' } } }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role, status } }) }) }),
      }),
      rpc,
    },
  };
}
async function redirected(promise: Promise<void>) {
  try {
    await promise;
  } catch (error) {
    return (error as { location?: string }).location;
  }
  return undefined;
}

afterEach(() => {
  mocks.createClient.mockReset();
  mocks.after.mockReset();
  mocks.flush.mockReset();
});

describe('email admin retry action', () => {
  it('refuses non-admin callers before reaching the retry RPC', async () => {
    const { client, rpc } = database('teacher');
    mocks.createClient.mockResolvedValue(client);
    const form = new FormData();
    form.set('id', id);
    expect(await redirected(retryEmailJob('en', form))).toBe('/en/admin/email?result=unavailable');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('retries the selected failed row through the protected RPC and schedules one bounded flush', async () => {
    const { client, rpc } = database('admin');
    mocks.createClient.mockResolvedValue(client);
    const form = new FormData();
    form.set('id', id);
    const location = await redirected(retryEmailJob('en', form));
    expect(rpc).toHaveBeenCalledWith('retry_email_job', { p_id: id });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(location).toBe('/en/admin/email?result=retried');
  });
  it('does not schedule delivery when the retry RPC rejects the row', async () => {
    const { client, rpc } = database('admin');
    rpc.mockResolvedValue({ data: null, error: { message: 'row not failed' } });
    mocks.createClient.mockResolvedValue(client);
    const form = new FormData();
    form.set('id', id);
    expect(await redirected(retryEmailJob('en', form))).toBe('/en/admin/email?result=unavailable');
    expect(rpc).toHaveBeenCalledWith('retry_email_job', { p_id: id });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
