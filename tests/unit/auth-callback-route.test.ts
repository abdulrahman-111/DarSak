import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createClientMock, isConfiguredMock, rpcMock, afterMock, getUserMock, profileQueryMock, onboardingDestinationMock } = vi.hoisted(() => ({ createClientMock: vi.fn(), isConfiguredMock: vi.fn(), rpcMock: vi.fn(), afterMock: vi.fn(), getUserMock: vi.fn(), profileQueryMock: vi.fn(), onboardingDestinationMock: vi.fn(async (_db: unknown, _userId: string, _role: string, _locale: string, fallback: string) => fallback) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock, isConfigured: isConfiguredMock }));
vi.mock('@/features/setup/destination', () => ({ resolveSetupDestination: onboardingDestinationMock }));
vi.mock('server-only',()=>({}));
vi.mock('next/server',async importOriginal=>({...await importOriginal<typeof import('next/server')>(),after:afterMock}));

import { GET } from '@/app/api/auth/callback/route';

const call = (query: string) => GET(new NextRequest(`https://dars.example/api/auth/callback?${query}`));
const location = (response: Response) => new URL(response.headers.get('location') ?? '');

describe('auth callback route', () => {
  const exchangeCodeForSession = vi.fn();
  const verifyOtp = vi.fn();

  beforeEach(() => {
    afterMock.mockReset();
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
    getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'email-user', identities: [{ provider: 'email' }] } }, error: null });
    onboardingDestinationMock.mockReset().mockImplementation(async (_db, _userId, _role, _locale, fallback) => fallback);
    profileQueryMock.mockReset().mockResolvedValue({ data: null, error: null });
    rpcMock.mockReset().mockResolvedValue({ data: 'teacher', error: null });
    isConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue({ auth: { exchangeCodeForSession, verifyOtp, getUser: getUserMock }, rpc: rpcMock, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profileQueryMock }) }) }) });
  });

  it('exchanges a PKCE code and redirects to next', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'email-user', identities: [{ provider: 'email' }] } }, error: null });
    const target = location(await call('code=abc&next=/ar/reset-password'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(target.origin).toBe('https://dars.example');
    expect(target.pathname).toBe('/ar/reset-password');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('does not run role completion for a generic email code carrying a Google role parameter', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'email-user', identities: [{ provider: 'email' }] } }, error: null });
    const target = location(await call('code=abc&next=/en/dashboard&google_role=teacher'));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(target.pathname).toBe('/en/login');
    expect(target.searchParams.get('error')).toBe('setup');
  });

  it.each(['', '&google_role=teacher'])('keeps Google-linked PKCE recovery on reset-password without onboarding calls%s', async roleParam => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'google-linked-user', identities: [{ provider: 'google' }] } }, error: null });
    profileQueryMock.mockResolvedValue({ data: { role: 'student', status: 'active' }, error: null });
    const target = location(await call(`code=abc&next=/en/reset-password${roleParam}`));
    expect(target.pathname).toBe('/en/reset-password');
    expect(rpcMock).not.toHaveBeenCalled();
    expect(profileQueryMock).not.toHaveBeenCalled();
    expect(onboardingDestinationMock).not.toHaveBeenCalled();
  });

  it('completes only a valid Google signup role after a successful code exchange', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'google-user', identities: [{ provider: 'google' }] } }, error: null });
    const target = location(await call('code=abc&next=/en/dashboard&google_role=teacher'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(rpcMock).toHaveBeenCalledWith('complete_google_signup', { p_role: 'teacher' });
    expect(target.pathname).toBe('/en/dashboard');
    expect(onboardingDestinationMock).toHaveBeenCalledWith(expect.anything(), 'google-user', 'teacher', 'en', '/en/dashboard');
    expect(afterMock).toHaveBeenCalledOnce();
  });

  it('does not schedule a teacher review request when Google completion returns an existing student role', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'google-user', identities: [{ provider: 'google' }] } }, error: null });
    rpcMock.mockResolvedValue({ data: 'student', error: null });
    await call('code=abc&next=/en/dashboard&google_role=teacher');
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('reports Google signup completion failures separately from invalid links', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'google-user', identities: [{ provider: 'google' }] } }, error: null });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'completion failed' } });
    const target = location(await call('code=abc&next=/en/dashboard&google_role=student'));
    expect(target.pathname).toBe('/en/login');
    expect(target.searchParams.get('error')).toBe('setup');
    expect(target.searchParams.get('google_role')).toBe('student');
  });

  it('preserves only the allowlisted role for a safe setup retry', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'google-user', identities: [{ provider: 'google' }] } }, error: null });
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

  it('sends a new roleless Google identity to the explicit role choice page without completing it', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'new-google', identities: [{ provider: 'google' }] } }, error: null });
    const target = location(await call('code=abc&next=/en/dashboard'));
    expect(profileQueryMock).toHaveBeenCalledOnce();
    expect(target.pathname).toBe('/en/choose-role');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each(['student', 'teacher', 'admin'])('does not ask an established %s Google profile to select a role', async role => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'existing-google', identities: [{ provider: 'google' }] } }, error: null });
    profileQueryMock.mockResolvedValue({ data: { role, status: 'active' }, error: null });
    const target = location(await call('code=abc&next=/en/dashboard'));
    expect(target.pathname).toBe('/en/dashboard');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('uses the Google onboarding destination for an existing student profile', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'existing-student', identities: [{ provider: 'google' }] } }, error: null });
    profileQueryMock.mockResolvedValue({ data: { role: 'student', status: 'active' }, error: null });
    onboardingDestinationMock.mockResolvedValue('/en/account/setup?returnTo=%2Fen%2Fdashboard');
    const target = location(await call('code=abc&next=/en/dashboard'));
    expect(onboardingDestinationMock).toHaveBeenCalledWith(expect.anything(), 'existing-student', 'student', 'en', '/en/dashboard');
    expect(target.pathname).toBe('/en/account/setup');
  });

  it('routes a legacy confirmed email callback through setup for an active teacher', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'confirmed-teacher', identities: [{ provider: 'email' }] } }, error: null });
    profileQueryMock.mockResolvedValue({ data: { role: 'teacher', status: 'active' }, error: null });
    onboardingDestinationMock.mockResolvedValue('/en/account/setup?returnTo=%2Fen%2Fteacher');
    const target = location(await call('code=abc&next=/en/teacher'));
    expect(onboardingDestinationMock).toHaveBeenCalledWith(expect.anything(), 'confirmed-teacher', 'teacher', 'en', '/en/teacher');
    expect(target.pathname).toBe('/en/account/setup');
  });

  it('sends authenticated confirmation users to the recoverable setup error page when profile lookup fails', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'confirmed-student', identities: [{ provider: 'email' }] } }, error: null });
    profileQueryMock.mockResolvedValue({ data: null, error: { message: 'profile read failed' } });
    const target = location(await call('code=abc&next=/en/dashboard'));
    expect(target.pathname).toBe('/en/account/setup');
    expect(target.searchParams.get('load')).toBe('error');
    expect(onboardingDestinationMock).not.toHaveBeenCalled();
  });

  it('routes legacy signup token_hash confirmations through setup', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'confirmed-student', identities: [{ provider: 'email' }] } }, error: null });
    profileQueryMock.mockResolvedValue({ data: { role: 'student', status: 'active' }, error: null });
    onboardingDestinationMock.mockResolvedValue('/en/account/setup?returnTo=%2Fen%2Fstudent');
    const target = location(await call('token_hash=h&type=signup&next=/en/student'));
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 'h' });
    expect(onboardingDestinationMock).toHaveBeenCalledWith(expect.anything(), 'confirmed-student', 'student', 'en', '/en/student');
    expect(target.pathname).toBe('/en/account/setup');
  });

  it('keeps recovery token callbacks on the reset destination without setup routing', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'recovering-student', identities: [{ provider: 'email' }] } }, error: null });
    const target = location(await call('token_hash=h&type=recovery&next=/en/reset-password'));
    expect(target.pathname).toBe('/en/reset-password');
    expect(onboardingDestinationMock).not.toHaveBeenCalled();
  });

  it('explains an existing student role when teacher signup is requested', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'google-user', identities: [{ provider: 'google' }] } }, error: null });
    rpcMock.mockResolvedValue({ data: 'student', error: null });
    const target = location(await call('code=abc&next=/en/dashboard&google_role=teacher'));
    expect(target.pathname).toBe('/en/login');
    expect(target.searchParams.get('error')).toBe('role-mismatch');
    expect(target.searchParams.get('actual')).toBe('student');
    expect(target.searchParams.get('requested')).toBe('teacher');
  });

  it.each(['teacher', 'student', 'admin'])('preserves an existing %s role returned by signup completion', async role => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'google-user', identities: [{ provider: 'google' }] } }, error: null });
    rpcMock.mockResolvedValue({ data: role, error: null });
    const target = location(await call('code=abc&next=/en/dashboard&google_role=teacher'));
    expect(rpcMock).toHaveBeenCalledWith('complete_google_signup', { p_role: 'teacher' });
    expect(target.pathname).toBe(role === 'teacher' ? '/en/dashboard' : '/en/login');
    if (role !== 'teacher') expect(target.searchParams.get('actual')).toBe(role);
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
