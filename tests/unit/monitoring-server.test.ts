vi.mock('server-only', () => ({}));
import { beforeEach, expect, it, vi } from 'vitest';
const { afterMock, rpcMock } = vi.hoisted(() => ({ afterMock: vi.fn(), rpcMock: vi.fn() }));
vi.mock('next/server', () => ({ after: afterMock }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
import { observeOperation } from '@/features/monitoring/server';
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
it('returns product result before isolated diagnostics and stores no submitted data', async () => {
  const result = { data: { email: 'private@example.test', token: 'secret' }, error: null };
  expect(await observeOperation('signup', 'en', () => Promise.resolve(result))).toBe(result);
  expect(rpcMock).not.toHaveBeenCalled();
  rpcMock.mockResolvedValue({ error: null });
  await afterMock.mock.calls[0][0]();
  expect(JSON.stringify(rpcMock.mock.calls)).not.toContain('private@example.test');
  expect(JSON.stringify(rpcMock.mock.calls)).not.toContain('secret');
});
it('does not let recording failure change a successful operation', async () => {
  rpcMock.mockRejectedValue(new Error('unavailable'));
  const value = { error: null, data: 1 };
  expect(await observeOperation('enrollment', 'ar', () => Promise.resolve(value))).toBe(value);
  await expect(afterMock.mock.calls[0][0]()).resolves.toBeUndefined();
});
it('preserves the original failure when the operation throws', async () => {
  const failure = new Error('private provider details');
  await expect(observeOperation('setup_save', 'en', () => Promise.reject(failure))).rejects.toBe(
    failure,
  );
  expect(JSON.stringify(afterMock.mock.calls)).not.toContain('private provider details');
});
