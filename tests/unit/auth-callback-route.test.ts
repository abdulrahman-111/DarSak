import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createClientMock, isConfiguredMock, rpcMock } = vi.hoisted(() => ({ createClientMock: vi.fn(), isConfiguredMock: vi.fn(), rpcMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock, isConfigured: isConfiguredMock }));

import { GET } from '@/app/api/auth/callback/route';

const call = (query: string) => GET(new NextRequest(`https://dars.example/api/auth/callback?${query}`));
const location = (response: Response) => new URL(response.headers.get('location') ?? '');

describe('auth callback route', () => {
  const exchangeCodeForSession = vi.fn();
  const verifyOtp = vi.fn();

  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    rpcMock.mockReset().mockResolvedValue({ data: 'teacher', error: null });
    isConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue({ auth: { exchangeCodeForSession, verifyOtp }, rpc: rpcMock });
  });

  it('exchanges a PKCE code and redirects to next', async () => {
    const target = location(await call('code=abc&next=/ar/reset-password'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(target.origin).toBe('https://dars.example');
    expect(target.pathname).toBe('/ar/reset-password');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('completes only a valid Google signup role after a successful code exchange', async () => {
    const target = location(await call('code=abc&next=/en/dashboard&google_role=teacher'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(rpcMock).toHaveBeenCalledWith('complete_google_signup', { p_role: 'teacher' });
    expect(target.pathname).toBe('/en/dashboard');
  });

  it('reports Google signup completion failures separately from invalid links', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'completion failed' } });
    const target = location(await call('code=abc&next=/en/dashboard&google_role=student'));
    expect(target.pathname).toBe('/en/login');
    expect(target.searchParams.get('error')).toBe('setup');
    expect(target.searchParams.get('google_role')).toBe('student');
  });

  it('preserves only the allowlisted role for a safe setup retry', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'completion failed' } });
    const target = location(await call('code=abc&next=/en/dashboard&google_role=teacher'));
    expect(target.pathname).toBe('/en/login');
    expect(target.searchParams.get('error')).toBe('setup');
    expect(target.searchParams.get('google_role')).toBe('teacher');
    const invalid = location(await call('code=abc&next=/en/dashboard&google_role=admin'));
    expect(invalid.pathname).toBe('/en/login');
    expect(invalid.searchParams.get('google_role')).toBeNull();
  });

  it('does not invoke Google completion for email or ordinary provider callbacks', async () => {
    await call('token_hash=h&type=recovery&next=/en/reset-password&google_role=teacher');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('verifies a token hash for custom email templates', async () => {
    const target = location(await call('token_hash=h&type=recovery&next=/en/reset-password'));
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'h' });
    expect(target.pathname).toBe('/en/reset-password');
  });

  it.each(['//evil.com', 'https://evil.com', '/\\evil', '/fr/x', '/en/../x'])('never redirects off-site for next=%s', async next => {
    const target = location(await call(`code=abc&next=${encodeURIComponent(next)}`));
    expect(target.origin).toBe('https://dars.example');
    expect(target.pathname).toMatch(/^\/(ar|en)\/dashboard$/);
  });

  it('sends failed exchanges to the login page with error=link in the next locale', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { code: 'bad_code' } });
    const target = location(await call('code=bad&next=/en/dashboard'));
    expect(target.pathname).toBe('/en/login');
    expect(target.search).toBe('?error=link');
  });

  it('fails when no code or token is supplied, or Supabase is unconfigured', async () => {
    expect(location(await call('next=/en/dashboard')).pathname).toBe('/en/login');
    isConfiguredMock.mockReturnValue(false);
    expect(location(await call('code=abc')).pathname).toBe('/ar/login');
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown OTP types', async () => {
    const target = location(await call('token_hash=h&type=bogus&next=/en/dashboard'));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(target.pathname).toBe('/en/login');
  });
});
