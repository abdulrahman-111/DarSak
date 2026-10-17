import { beforeEach, describe, expect, it, vi } from 'vitest';
const { edgeMock, createClientMock, isConfiguredMock, cookiesMock, redirectMock } = vi.hoisted(() => ({ edgeMock: vi.fn(), createClientMock: vi.fn(), isConfiguredMock: vi.fn(), cookiesMock: vi.fn(), redirectMock: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }) }));
vi.mock('@/features/account/edge', () => ({ callDeletionEdge: edgeMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock, isConfigured: isConfiguredMock }));
vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('server-only', () => ({}));

import { deleteAccount, startGoogleDeletion } from '@/features/account/actions';

describe('account deletion confirmation', () => {
  beforeEach(() => { edgeMock.mockReset(); createClientMock.mockReset(); isConfiguredMock.mockReturnValue(true); cookiesMock.mockReset(); redirectMock.mockClear(); });

  it('starts Google reauthentication with the Account delete route as its callback', async () => {
    const set = vi.fn(); const remove = vi.fn();
    cookiesMock.mockResolvedValue({ set, delete: remove });
    const signInWithOAuth = vi.fn(async (_input: { provider: string; options: { redirectTo: string; queryParams: { prompt: string } } }) => ({ data: { url: 'https://accounts.google.test/auth' }, error: null }));
    createClientMock.mockResolvedValue({ auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 'access' } } }),
      signInWithOAuth,
    } });
    edgeMock.mockResolvedValue({ data: { intent_id: 'intent', nonce: 'nonce', expires_at: new Date(Date.now() + 60_000).toISOString() } });
    try { await startGoogleDeletion('en'); } catch (error) { expect((error as Error).message).toContain('NEXT_REDIRECT:'); }
    const [{ options }] = signInWithOAuth.mock.calls[0];
    const callback = new URL(options.redirectTo);
    expect(callback.searchParams.get('next')).toBe('/en/account/delete');
    expect(redirectMock).toHaveBeenCalledWith('https://accounts.google.test/auth');
  });

  it('returns to Account delete when Google reauthentication cannot start', async () => {
    cookiesMock.mockResolvedValue({ set: vi.fn(), delete: vi.fn() });
    createClientMock.mockResolvedValue({ auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 'access' } } }),
    } });
    edgeMock.mockResolvedValue({ data: null, error: 'unavailable' });
    try { await startGoogleDeletion('ar'); } catch (error) { expect((error as Error).message).toContain('NEXT_REDIRECT:'); }
    expect(redirectMock).toHaveBeenCalledWith('/ar/account/delete?error=unavailable');
  });

  it('rejects an unchecked warning before contacting the deletion service', async () => {
    const form = new FormData(); form.set('confirmation', 'DELETE');
    const result = await deleteAccount('en', null, form);
    expect(result?.error).toMatch(/confirm the warning/i);
    expect(edgeMock).not.toHaveBeenCalled();
  });

  it('requires the exact uppercase word DELETE', async () => {
    const form = new FormData(); form.set('acknowledged', 'on'); form.set('confirmation', 'delete');
    const result = await deleteAccount('en', null, form);
    expect(result?.error).toMatch(/Type DELETE/i);
    expect(edgeMock).not.toHaveBeenCalled();
  });
});
