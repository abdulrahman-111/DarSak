import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getAdminActor: vi.fn() }));
vi.mock('@admin/lib/access', () => ({ getAdminActor: mocks.getAdminActor }));
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw Object.assign(new Error('redirect'), { location });
  },
}));
import { retryEmailJob } from '@admin/features/email/admin-actions';

const id = '5a4c7d3e-1f2a-4b67-8c90-123456789abc';
function database() {
  const rpc = vi.fn(
    async (
      _name: string,
      _args?: unknown,
    ): Promise<{ data: null; error: { message: string } | null }> => ({
      data: null,
      error: null,
    }),
  );
  return { actor: { db: { rpc }, id: 'admin-id' }, rpc };
}
async function redirected(promise: Promise<void>) {
  try {
    await promise;
  } catch (error) {
    return (error as { location?: string }).location;
  }
  return undefined;
}

afterEach(() => mocks.getAdminActor.mockReset());

describe('email admin retry action', () => {
  it('refuses non-admin callers before reaching the retry RPC', async () => {
    mocks.getAdminActor.mockResolvedValue(null);
    const form = new FormData();
    form.set('id', id);
    expect(await redirected(retryEmailJob('en', form))).toBe('/en/admin/email?result=unavailable');
  });
  it('retries the selected failed row and leaves delivery queued for the separate worker', async () => {
    const { actor, rpc } = database();
    mocks.getAdminActor.mockResolvedValue(actor);
    const form = new FormData();
    form.set('id', id);
    const location = await redirected(retryEmailJob('en', form));
    expect(rpc).toHaveBeenCalledWith('retry_email_job', { p_id: id });
    expect(location).toBe('/en/admin/email?result=retried');
  });
  it('reports a rejected retry without claiming the message was queued', async () => {
    const { actor, rpc } = database();
    rpc.mockResolvedValue({ data: null, error: { message: 'row not failed' } });
    mocks.getAdminActor.mockResolvedValue(actor);
    const form = new FormData();
    form.set('id', id);
    expect(await redirected(retryEmailJob('en', form))).toBe('/en/admin/email?result=unavailable');
    expect(rpc).toHaveBeenCalledWith('retry_email_job', { p_id: id });
  });
});
