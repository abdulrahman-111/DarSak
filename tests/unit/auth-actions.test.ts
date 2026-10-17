import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, getVerifiedUserMock, isConfiguredMock, redirectMock, afterMock, onboardingDestinationMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getVerifiedUserMock: vi.fn(),
  isConfiguredMock: vi.fn(),
  redirectMock: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  afterMock: vi.fn(),
  onboardingDestinationMock: vi.fn(async (_db: unknown, _userId: string, _role: string, _locale: string, fallback: string) => fallback),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  getVerifiedUser: getVerifiedUserMock,
  isConfigured: isConfiguredMock,
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('server-only',()=>({}));
vi.mock('next/server',()=>({after:afterMock}));
vi.mock('@/features/auth/google-onboarding', () => ({ googleOnboardingDestination: onboardingDestinationMock }));

import {
  chooseGoogleRoleAction, forgotPasswordAction, googleSignInAction, loginAction, resendConfirmationAction, resetPasswordAction, signupAction, verifySignupCodeAction,
} from '@/features/auth/actions';

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
const signup = { fullName: 'Sara Ali', email: 'sara@example.com', password: 'password123', role: 'student' };
const redirectTarget = async (run: () => Promise<unknown>) => {
  try { await run(); } catch (error) { return (error as Error).message.replace('NEXT_REDIRECT:', ''); }
  return null;
};

describe('auth actions', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    getVerifiedUserMock.mockReset();
    redirectMock.mockClear();
    afterMock.mockReset();
    onboardingDestinationMock.mockReset().mockImplementation(async (_db, _userId, _role, _locale, fallback) => fallback);
    isConfiguredMock.mockReturnValue(true);
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dars.example');
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('loginAction', () => {
    it('returns a generic message for invalid_credentials', async () => {
      createClientMock.mockResolvedValue({ auth: { signInWithPassword: async () => ({ data: {}, error: { code: 'invalid_credentials' } }) } });
      const result = await loginAction('en', null, form({ email: 'a@b.co', password: 'x' }));
      expect(result).toEqual({ error: 'Unable to sign in. Check your credentials and try again.', email: 'a@b.co' });
      expect(JSON.stringify(result)).not.toContain('"password"');
    });

    it('points unconfirmed accounts to the resend page', async () => {
      createClientMock.mockResolvedValue({ auth: { signInWithPassword: async () => ({ data: {}, error: { code: 'email_not_confirmed' } }) } });
      const result = await loginAction('ar', null, form({ email: 'a@b.co', password: 'x' }));
      expect(result?.resendHref).toBe('/ar/check-email?email=a%40b.co');
    });

    it('passes the captcha token only when present', async () => {
      const signIn = vi.fn(async () => ({ data: {}, error: { code: 'captcha_failed' } }));
      createClientMock.mockResolvedValue({ auth: { signInWithPassword: signIn } });
      await loginAction('en', null, form({ email: 'a@b.co', password: 'x', 'cf-turnstile-response': 'tok' }));
      expect(signIn).toHaveBeenLastCalledWith({ email: 'a@b.co', password: 'x', options: { captchaToken: 'tok' } });
      await loginAction('en', null, form({ email: 'a@b.co', password: 'x' }));
      expect(signIn).toHaveBeenLastCalledWith({ email: 'a@b.co', password: 'x', options: {} });
    });

    it('rejects unknown locales before touching Supabase', async () => {
      const result = await loginAction('fr', null, form({ email: 'a@b.co', password: 'x' }));
      expect(result?.error).toBe('Invalid language');
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('signupAction', () => {
    it('sends emailRedirectTo and the captcha token, then redirects to check-email without a session', async () => {
      const signUp = vi.fn(async () => ({ data: { session: null }, error: null }));
      createClientMock.mockResolvedValue({ auth: { signUp } });
      const target = await redirectTarget(() => signupAction('en', null, form({ ...signup, 'cf-turnstile-response': 'tok' })));
      expect(target).toBe('/en/check-email?email=sara%40example.com');
      expect(signUp).toHaveBeenCalledWith({
        email: signup.email,
        password: signup.password,
        options: {
          data: { full_name: 'Sara Ali', requested_role: 'student' },
          emailRedirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard',
          captchaToken: 'tok',
        },
      });
    });

    it('goes to the dashboard when a session is returned', async () => {
      createClientMock.mockResolvedValue({ auth: { signUp: async () => ({ data: { session: {} }, error: null }) } });
      expect(await redirectTarget(() => signupAction('ar', null, form(signup)))).toBe('/ar/dashboard');
    });

    it('schedules a bounded outbox flush after teacher signup succeeds', async () => {
      afterMock.mockReset();
      createClientMock.mockResolvedValue({ auth: { signUp: async () => ({ data: { session: null, user: { id: 'teacher-id' } }, error: null }) } });
      expect(await redirectTarget(() => signupAction('en', null, form({ ...signup, role: 'teacher' })))).toBe('/en/check-email?email=sara%40example.com');
      expect(afterMock).toHaveBeenCalledOnce();
    });

    it('maps already-registered and weak-password errors', async () => {
      createClientMock.mockResolvedValue({ auth: { signUp: async () => ({ data: {}, error: { code: 'user_already_exists' } }) } });
      expect((await signupAction('en', null, form(signup)))?.error).toMatch(/already registered/);
      createClientMock.mockResolvedValue({ auth: { signUp: async () => ({ data: {}, error: { code: 'weak_password' } }) } });
      expect((await signupAction('en', null, form(signup)))?.error).toMatch(/too weak/);
    });

    it('echoes email, name and role (never the password) on error', async () => {
      createClientMock.mockResolvedValue({ auth: { signUp: async () => ({ data: {}, error: { code: 'email_address_invalid' } }) } });
      const result = await signupAction('en', null, form({ ...signup, role: 'teacher' }));
      expect(result).toEqual({
        error: "This email address can't be used. Please use a different email.",
        email: 'sara@example.com', fullName: 'Sara Ali', role: 'teacher',
      });
      expect(JSON.stringify(result)).not.toContain('password123');
    });

    it('validates input before creating a client', async () => {
      const result = await signupAction('en', null, form({ ...signup, password: 'short' }));
      expect(result?.error).toMatch(/at least 8/);
      expect(result).toMatchObject({ email: 'sara@example.com', fullName: 'Sara Ali', role: 'student' });
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('forgotPasswordAction', () => {
    const run = (email = 'sara@example.com') => forgotPasswordAction('en', null, form({ email }));

    it('returns the same neutral notice whether or not the account exists', async () => {
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: async () => ({ data: {}, error: null }) } });
      const existing = await run();
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: async () => ({ data: {}, error: { code: 'user_not_found' } }) } });
      const missing = await run('nobody@example.com');
      expect(missing).toEqual(existing);
      expect(existing?.notice).toMatch(/If an account exists/);
      expect(existing?.error).toBeUndefined();
    });

    it('surfaces rate-limit and captcha errors only', async () => {
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: async () => ({ data: {}, error: { code: 'over_email_send_rate_limit' } }) } });
      expect((await run())?.error).toMatch(/Too many attempts/);
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: async () => ({ data: {}, error: { code: 'captcha_failed' } }) } });
      expect((await run())?.error).toMatch(/Security check/);
    });

    it('surfaces email_address_invalid and keeps the typed email', async () => {
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: async () => ({ data: {}, error: { code: 'email_address_invalid' } }) } });
      const result = await run('bad@example.com');
      expect(result?.error).toMatch(/can't be used/);
      expect(result?.email).toBe('bad@example.com');
    });

    it('reports unexpected provider errors without claiming the reset email was sent', async () => {
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: async () => ({ data: {}, error: { code: 'smtp_failed' } }) } });
      const result = await run();
      expect(result?.error).toMatch(/could not confirm.*sent/i);
      expect(result?.notice).toBeUndefined();
    });

    it('redirects the link through the callback to the locale reset page', async () => {
      const reset = vi.fn(async () => ({ data: {}, error: null }));
      createClientMock.mockResolvedValue({ auth: { resetPasswordForEmail: reset } });
      await forgotPasswordAction('ar', null, form({ email: 'sara@example.com', 'cf-turnstile-response': 'tok' }));
      expect(reset).toHaveBeenCalledWith('sara@example.com', {
        redirectTo: 'https://dars.example/api/auth/callback?next=/ar/reset-password',
        captchaToken: 'tok',
      });
    });

    it('rejects malformed emails without calling Supabase', async () => {
      expect((await run('nope'))?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('verifySignupCodeAction', () => {
    it('verifies only a six-digit email OTP and routes by the verified profile role', async () => {
      const verifyOtp = vi.fn(async () => ({ data: { session: {}, user: { id: 'student-id' } }, error: null }));
      const maybeSingle = vi.fn(async () => ({ data: { role: 'student', status: 'active' }, error: null }));
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      createClientMock.mockResolvedValue({ auth: { verifyOtp }, from: vi.fn(() => ({ select })) });
      expect(await redirectTarget(() => verifySignupCodeAction('en', null, form({ email: 'sara@example.com', token: '123456' })))).toBe('/en/student');
      expect(verifyOtp).toHaveBeenCalledWith({ email: 'sara@example.com', token: '123456', type: 'signup' });
    });

    it('returns the same neutral error for invalid or expired codes and never echoes the code', async () => {
      const verifyOtp = vi.fn(async () => ({ data: {}, error: { code: 'otp_expired' } }));
      createClientMock.mockResolvedValue({ auth: { verifyOtp } });
      const result = await verifySignupCodeAction('ar', null, form({ email: 'sara@example.com', token: '123456' }));
      expect(result).toEqual({ error: 'تعذر التحقق من هذا الرمز. راجعه وحاول مرة أخرى، أو اطلب رمزًا جديدًا.', email: 'sara@example.com' });
      expect(JSON.stringify(result)).not.toContain('123456');
    });

    it('rejects malformed codes without contacting Supabase', async () => {
      const result = await verifySignupCodeAction('en', null, form({ email: 'sara@example.com', token: 'not-a-code' }));
      expect(result?.error).toMatch(/could not be verified/);
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('surfaces rate limiting without treating the code as invalid', async () => {
      createClientMock.mockResolvedValue({ auth: { verifyOtp: async () => ({ data: {}, error: { code: 'over_request_rate_limit' } }) } });
      expect((await verifySignupCodeAction('en', null, form({ email: 'sara@example.com', token: '123456' })))?.error).toMatch(/Too many attempts/);
    });

    it('does not route unless OTP verification returned a session', async () => {
      createClientMock.mockResolvedValue({ auth: { verifyOtp: async () => ({ data: { user: { id: 'student-id' } }, error: null }) } });
      expect((await verifySignupCodeAction('en', null, form({ email: 'sara@example.com', token: '123456' })))?.error).toMatch(/could not be verified/);
    });
  });

  describe('resetPasswordAction', () => {
    const passwords = (password: string, confirmPassword = password) => form({ password, confirmPassword });

    it('sends unverified users back to forgot-password', async () => {
      getVerifiedUserMock.mockResolvedValue(null);
      expect(await redirectTarget(() => resetPasswordAction('en', null, passwords('password123')))).toBe('/en/forgot-password');
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('rejects mismatched confirmation and out-of-range passwords', async () => {
      getVerifiedUserMock.mockResolvedValue({ id: 'u1' });
      expect((await resetPasswordAction('en', null, passwords('password123', 'password124')))?.error).toMatch(/do not match/);
      expect((await resetPasswordAction('en', null, passwords('short')))?.error).toMatch(/8 to 72/);
      expect((await resetPasswordAction('en', null, passwords('x'.repeat(73))))?.error).toMatch(/8 to 72/);
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('maps same_password and redirects to the dashboard on success', async () => {
      getVerifiedUserMock.mockResolvedValue({ id: 'u1' });
      createClientMock.mockResolvedValue({ auth: { updateUser: async () => ({ data: {}, error: { code: 'same_password' } }) } });
      expect((await resetPasswordAction('en', null, passwords('password123')))?.error).toMatch(/different/);
      const updateUser = vi.fn(async () => ({ data: {}, error: null }));
      createClientMock.mockResolvedValue({ auth: { updateUser } });
      expect(await redirectTarget(() => resetPasswordAction('ar', null, passwords('password123')))).toBe('/ar/dashboard');
      expect(updateUser).toHaveBeenCalledWith({ password: 'password123' });
    });
  });

  describe('resendConfirmationAction', () => {
    it('is neutral for unknown or already-confirmed emails and sends the callback URL', async () => {
      const resend = vi.fn(async () => ({ data: {}, error: { code: 'user_not_found' } }));
      createClientMock.mockResolvedValue({ auth: { resend } });
      const result = await resendConfirmationAction('en', null, form({ email: 'sara@example.com' }));
      expect(result?.notice).toMatch(/If an account is waiting/);
      expect(result?.error).toBeUndefined();
      expect(resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'sara@example.com',
        options: { emailRedirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard' },
      });
    });

    it('surfaces rate limiting', async () => {
      createClientMock.mockResolvedValue({ auth: { resend: async () => ({ data: {}, error: { code: 'over_email_send_rate_limit' } }) } });
      expect((await resendConfirmationAction('en', null, form({ email: 'sara@example.com' })))?.error).toMatch(/Too many attempts/);
    });

    it('keeps identity-dependent errors neutral and reports unexpected delivery failures', async () => {
      createClientMock.mockResolvedValue({ auth: { resend: async () => ({ data: {}, error: { code: 'user_not_found' } }) } });
      expect((await resendConfirmationAction('en', null, form({ email: 'sara@example.com' })))?.notice).toMatch(/If an account is waiting/);
      createClientMock.mockResolvedValue({ auth: { resend: async () => ({ data: {}, error: { code: 'smtp_failed' } }) } });
      expect((await resendConfirmationAction('en', null, form({ email: 'sara@example.com' })))?.error).toMatch(/could not confirm.*sent/i);
    });
  });

  describe('googleSignInAction', () => {
    it('is inert when Google is not enabled', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', '');
      const result = await googleSignInAction('en', null, form({}));
      expect(result?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('starts OAuth without assigning a role when no role was selected', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      const signInWithOAuth = vi.fn(async () => ({ data: { url: 'https://accounts.google.com/o/oauth2' }, error: null }));
      createClientMock.mockResolvedValue({ auth: { signInWithOAuth } });
      expect(await redirectTarget(() => googleSignInAction('en', null, form({ next: '//evil.com' })))).toBe('https://accounts.google.com/o/oauth2');
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard' },
      });
    });

    it('passes an allowlisted signup role to the callback without provider authorization parameters', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      const signInWithOAuth = vi.fn(async () => ({ data: { url: 'https://accounts.google.com/o/oauth2' }, error: null }));
      createClientMock.mockResolvedValue({ auth: { signInWithOAuth } });
      await redirectTarget(() => googleSignInAction('en', null, form({ google_role: 'teacher' })));
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard&google_role=teacher' },
      });
    });

    it('rejects a malformed signup role before starting OAuth', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      const result = await googleSignInAction('en', null, form({ google_role: 'admin' }));
      expect(result?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });
  });

  describe('chooseGoogleRoleAction', () => {
    const profileQuery = vi.fn();
    const rpc = vi.fn();
    beforeEach(() => { profileQuery.mockReset(); rpc.mockReset(); });
    const client = (user: unknown) => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profileQuery }) }) }),
      rpc,
    });

    it('requires an authenticated Google identity and a valid student or teacher role', async () => {
      createClientMock.mockResolvedValue(client({ id: 'u1', identities: [{ provider: 'password' }] }));
      expect(await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'teacher' })))).toBe('/en/login');
      createClientMock.mockResolvedValue(client({ id: 'u1', identities: [{ provider: 'google' }] }));
      expect(await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'admin' })))).toBe('/en/login?error=setup');
      expect(rpc).not.toHaveBeenCalled();
    });

    it('completes only a new profile with an allowlisted role', async () => {
      profileQuery.mockResolvedValue({ data: null, error: null });
      rpc.mockReset().mockResolvedValue({ data: 'teacher', error: null });
      createClientMock.mockResolvedValue(client({ id: 'u1', identities: [{ provider: 'google' }] }));
      expect(await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'teacher' })))).toBe('/en/teacher');
      expect(rpc).toHaveBeenCalledWith('complete_google_signup', { p_role: 'teacher' });
      expect(onboardingDestinationMock).toHaveBeenCalledWith(expect.anything(), 'u1', 'teacher', 'en', '/en/teacher');
    });

    it('does not complete an existing student profile from the teacher choice page', async () => {
      profileQuery.mockResolvedValue({ data: { role: 'student', status: 'active' }, error: null });
      createClientMock.mockResolvedValue(client({ id: 'u1', identities: [{ provider: 'google' }] }));
      expect(await redirectTarget(() => chooseGoogleRoleAction('en', form({ google_role: 'teacher' })))).toBe('/en/student');
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
