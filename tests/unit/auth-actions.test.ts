import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, getVerifiedUserMock, isConfiguredMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getVerifiedUserMock: vi.fn(),
  isConfiguredMock: vi.fn(),
  redirectMock: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
  getVerifiedUser: getVerifiedUserMock,
  isConfigured: isConfiguredMock,
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import {
  forgotPasswordAction, googleSignInAction, loginAction, resendConfirmationAction, resetPasswordAction, signupAction,
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
    isConfiguredMock.mockReturnValue(true);
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://dars.example');
  });
  afterEach(() => vi.unstubAllEnvs());

  describe('loginAction', () => {
    it('returns a generic message for invalid_credentials', async () => {
      createClientMock.mockResolvedValue({ auth: { signInWithPassword: async () => ({ data: {}, error: { code: 'invalid_credentials' } }) } });
      const result = await loginAction('en', null, form({ email: 'a@b.co', password: 'x' }));
      expect(result).toEqual({ error: 'Unable to sign in. Check your credentials and try again.' });
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

    it('maps already-registered and weak-password errors', async () => {
      createClientMock.mockResolvedValue({ auth: { signUp: async () => ({ data: {}, error: { code: 'user_already_exists' } }) } });
      expect((await signupAction('en', null, form(signup)))?.error).toMatch(/already registered/);
      createClientMock.mockResolvedValue({ auth: { signUp: async () => ({ data: {}, error: { code: 'weak_password' } }) } });
      expect((await signupAction('en', null, form(signup)))?.error).toMatch(/too weak/);
    });

    it('validates input before creating a client', async () => {
      const result = await signupAction('en', null, form({ ...signup, password: 'short' }));
      expect(result?.error).toMatch(/at least 8/);
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
  });

  describe('googleSignInAction', () => {
    it('is inert when Google is not enabled', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', '');
      const result = await googleSignInAction('en', null, form({}));
      expect(result?.error).toBeTruthy();
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('starts OAuth with a sanitized next and redirects to the provider', async () => {
      vi.stubEnv('NEXT_PUBLIC_AUTH_GOOGLE_ENABLED', 'true');
      const signInWithOAuth = vi.fn(async () => ({ data: { url: 'https://accounts.google.com/o/oauth2' }, error: null }));
      createClientMock.mockResolvedValue({ auth: { signInWithOAuth } });
      expect(await redirectTarget(() => googleSignInAction('en', null, form({ next: '//evil.com' })))).toBe('https://accounts.google.com/o/oauth2');
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'https://dars.example/api/auth/callback?next=/en/dashboard' },
      });
    });
  });
});
