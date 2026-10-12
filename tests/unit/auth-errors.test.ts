import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '@/features/auth/errors';

describe('authErrorMessage', () => {
  it.each([
    'invalid_credentials', 'email_not_confirmed', 'user_already_exists', 'email_exists', 'weak_password',
    'over_email_send_rate_limit', 'over_request_rate_limit', 'captcha_failed', 'same_password', 'signup_disabled',
  ])('returns a distinct English and Arabic message for %s', code => {
    const en = authErrorMessage('en', code, 'login');
    const ar = authErrorMessage('ar', code, 'login');
    expect(en).toBeTruthy();
    expect(/[\u0600-\u06FF]/.test(ar)).toBe(true);
    expect(/[\u0600-\u06FF]/.test(en)).toBe(false);
  });

  it('treats email_exists like user_already_exists and both rate limits alike', () => {
    expect(authErrorMessage('en', 'email_exists', 'signup')).toBe(authErrorMessage('en', 'user_already_exists', 'signup'));
    expect(authErrorMessage('ar', 'over_email_send_rate_limit', 'reset')).toBe(authErrorMessage('ar', 'over_request_rate_limit', 'reset'));
  });

  it('keeps invalid_credentials generic and free of account hints', () => {
    const message = authErrorMessage('en', 'invalid_credentials', 'login');
    expect(message).toBe(authErrorMessage('en', undefined, 'login'));
    expect(message).not.toMatch(/not found|no account|wrong password|does not exist/i);
  });

  it.each([
    ['login', 'Unable to sign in'],
    ['signup', 'Unable to create an account'],
    ['reset', 'Unable to send the reset link'],
    ['update', 'Unable to update your password'],
  ] as const)('falls back to a generic %s message for unknown or missing codes', (context, text) => {
    expect(authErrorMessage('en', 'something_new', context)).toContain(text);
    expect(authErrorMessage('en', undefined, context)).toContain(text);
    expect(/[\u0600-\u06FF]/.test(authErrorMessage('ar', 'something_new', context))).toBe(true);
  });

  it('uses English for any non-Arabic locale string', () => {
    expect(authErrorMessage('en', 'captcha_failed', 'login')).toMatch(/Security check/);
  });
});
