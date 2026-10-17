import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { createClientMock, isConfiguredMock, cookiesMock, edgeMock, afterMock } = vi.hoisted(() => ({ createClientMock: vi.fn(), isConfiguredMock: vi.fn(), cookiesMock: vi.fn(), edgeMock: vi.fn(), afterMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock, isConfigured: isConfiguredMock }));
vi.mock('@/features/account/edge', () => ({ callDeletionEdge: edgeMock }));
vi.mock('@/features/setup/destination', () => ({ resolveSetupDestination: vi.fn(async (_db: unknown, _id: string, _role: string, _locale: string, fallback: string) => fallback) }));
vi.mock('@/features/email/worker', () => ({ flushEmailOutbox: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: afterMock }));
import { GET } from '@/app/api/auth/callback/route';

describe('Google deletion intent on the auth callback', () => {
  const exchangeCodeForSession = vi.fn();
  const getUser = vi.fn();
  const getSession = vi.fn();
  const verifyOtp = vi.fn();
  const cookieDelete = vi.fn();
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'same-user', identities: [{ provider: 'google' }] } }, error: null });
    getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'same-user' }, access_token: 'fresh-oauth-token' } } });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    createClientMock.mockReset().mockResolvedValue({ auth: { exchangeCodeForSession, getUser, getSession, verifyOtp }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'student', status: 'active' }, error: null }) }) }) }) });
    isConfiguredMock.mockReturnValue(true);
    cookiesMock.mockResolvedValue({ get: (name: string) => ({ 'dars-delete-intent': { value: 'intent-1' }, 'dars-delete-nonce': { value: 'one-use-nonce' }, 'dars-delete-owner': { value: 'same-user' } } as Record<string, { value: string }>)[name], delete: cookieDelete });
    edgeMock.mockReset().mockResolvedValue({ data: { state: 'verified' }, error: null });
    afterMock.mockReset(); cookieDelete.mockReset();
  });
  it('submits the post-exchange token and owner-bound nonce, then returns for explicit confirmation', async () => {
    const response = await GET(new NextRequest('https://dars.example/api/auth/callback?code=pkce&delete_intent=intent-1&next=/en/account/delete'));
    expect(edgeMock).toHaveBeenCalledWith('fresh-oauth-token', { operation: 'complete_google_reauth', intent_id: 'intent-1', nonce: 'one-use-nonce' });
    expect(new URL(response.headers.get('location')!).pathname).toBe('/en/account/delete');
    expect(response.cookies.get('dars-delete-google-ready')?.value).toBe('intent-1:same-user');
  });
  it('does not complete an intent on an ordinary Google callback', async () => {
    await GET(new NextRequest('https://dars.example/api/auth/callback?code=pkce&next=/en/account/delete'));
    expect(edgeMock).not.toHaveBeenCalled();
  });
  it('does not treat a query marker without a PKCE code as proof', async () => {
    await GET(new NextRequest('https://dars.example/api/auth/callback?delete_intent=intent-1&next=/en/account/delete'));
    expect(edgeMock).not.toHaveBeenCalled();
  });
  it('rejects a callback identity that differs from the original owner', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'different-user', identities: [{ provider: 'google' }] } }, error: null });
    await GET(new NextRequest('https://dars.example/api/auth/callback?code=pkce&delete_intent=intent-1&next=/en/account/delete'));
    expect(edgeMock).not.toHaveBeenCalled();
  });
  it('keeps password recovery on the normal reset route despite deletion query parameters', async () => {
    const response = await GET(new NextRequest('https://dars.example/api/auth/callback?code=recovery&delete_intent=intent-1&next=/en/reset-password'));
    expect(edgeMock).not.toHaveBeenCalled();
    expect(new URL(response.headers.get('location')!).pathname).toBe('/en/reset-password');
  });
});
