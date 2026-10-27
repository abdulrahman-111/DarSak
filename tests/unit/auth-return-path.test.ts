import { describe, expect, it } from 'vitest';
import {
  loginRedirectPath,
  safeAuthNext,
  safeLoginReturnPath,
  switchInternalLocalePath,
  switchLocaleReturnParams,
} from '@/features/auth/return-path';

const groupId = 'A70EA958-E2D5-4C9C-90D1-4E001D9AF93C';

describe('login return paths', () => {
  it('allows same-locale group and class UUID paths for English and Arabic', () => {
    expect(safeLoginReturnPath('en', `/en/groups/${groupId}`)).toBe(`/en/groups/${groupId}`);
    expect(safeLoginReturnPath('en', `/en/classes/${groupId.toLowerCase()}`)).toBe(
      `/en/classes/${groupId.toLowerCase()}`,
    );
    expect(safeLoginReturnPath('en', '/en/groups/00000000-0000-4000-A000-000000000000')).toBe(
      '/en/groups/00000000-0000-4000-A000-000000000000',
    );
    expect(safeLoginReturnPath('ar', `/ar/groups/${groupId}`)).toBe(`/ar/groups/${groupId}`);
    expect(safeLoginReturnPath('ar', `/ar/classes/${groupId.toLowerCase()}`)).toBe(
      `/ar/classes/${groupId.toLowerCase()}`,
    );
  });

  it('falls back to the same-locale dashboard for invalid or repeated next values', () => {
    expect(loginRedirectPath('en', undefined)).toBe('/en/dashboard');
    expect(
      loginRedirectPath('ar', [
        '/ar/groups/00000000-0000-4000-8000-000000000000',
        '/ar/groups/00000000-0000-4000-8000-000000000001',
      ]),
    ).toBe('/ar/dashboard');
    expect(loginRedirectPath('en', '/en/groups/not-a-uuid')).toBe('/en/dashboard');
  });

  it.each([
    ['student', '/en/student'],
    ['teacher', '/en/teacher'],
    ['admin', '/en/login?error=admin-portal'],
  ])('routes an active %s to their role home by default', (role, path) => {
    expect(loginRedirectPath('en', undefined, { role, status: 'active' })).toBe(path);
  });

  it('keeps a safe group return path ahead of the role home', () => {
    const groupPath = '/ar/groups/00000000-0000-4000-8000-000000000000';
    expect(loginRedirectPath('ar', groupPath, { role: 'teacher', status: 'active' })).toBe(
      groupPath,
    );
  });

  it.each([null, { role: 'teacher', status: 'suspended' }, { role: 'unknown', status: 'active' }])(
    'uses the guarded dashboard fallback for missing or invalid active profiles',
    profile => {
      expect(loginRedirectPath('en', undefined, profile)).toBe('/en/dashboard');
    },
  );

  it.each([
    'https://example.com/en/groups/00000000-0000-4000-8000-000000000000',
    '//example.com/en/groups/00000000-0000-4000-8000-000000000000',
    '/\\example.com/en/groups/00000000-0000-4000-8000-000000000000',
    '/en/groups/00000000-0000-4000-8000-000000000000?next=https://example.com',
    '/en/groups/00000000-0000-4000-8000-000000000000#external',
    '/en/groups%2f00000000-0000-4000-8000-000000000000',
    '/en/../en/groups/00000000-0000-4000-8000-000000000000',
    '/en/groups/00000000-0000-0000-8000-000000000000',
    '/EN/groups/00000000-0000-4000-8000-000000000000',
    '/en/GROUPS/00000000-0000-4000-8000-000000000000',
    '/en/groups/00000000-0000-4000-8000-000000000000\n',
    '/ar/groups/00000000-0000-4000-8000-000000000000',
    '/en/teachers/00000000-0000-4000-8000-000000000000',
  ])('rejects unsafe or out-of-scope path %s', path => {
    expect(loginRedirectPath('en', path)).toBe('/en/dashboard');
  });
});

describe('safeAuthNext', () => {
  it('keeps valid locale-prefixed local paths', () => {
    expect(safeAuthNext('/ar/reset-password', 'en')).toBe('/ar/reset-password');
    expect(safeAuthNext('/en/dashboard', 'ar')).toBe('/en/dashboard');
    expect(safeAuthNext('/en', 'ar')).toBe('/en');
  });

  it.each([
    '//evil.com',
    '/\\evil',
    '/en/a\\b',
    'https://x',
    '/fr/x',
    '/en/../x',
    '/en//x',
    '/en/x?next=https://evil.com',
    '/en/x#frag',
    '',
    ['/ar/reset-password'],
    undefined,
    null,
  ])('falls back to the fallback-locale dashboard for %j', candidate => {
    expect(safeAuthNext(candidate, 'ar')).toBe('/ar/dashboard');
  });
});

describe('switchInternalLocalePath', () => {
  it.each([
    [
      '/en/groups/00000000-0000-4000-8000-000000000000?view=details#materials',
      'en',
      'ar',
      '/ar/groups/00000000-0000-4000-8000-000000000000?view=details#materials',
    ],
    [
      '/ar/classes/00000000-0000-4000-8000-000000000000?from=login#schedule',
      'ar',
      'en',
      '/en/classes/00000000-0000-4000-8000-000000000000?from=login#schedule',
    ],
    [
      '/en/login?next=%2Fen%2Fgroups%2F00000000-0000-4000-8000-000000000000#form',
      'en',
      'ar',
      '/ar/login?next=%2Fen%2Fgroups%2F00000000-0000-4000-8000-000000000000#form',
    ],
  ] as const)(
    'switches %s from %s to %s and keeps its query and fragment',
    (path, from, to, expected) => {
      expect(switchInternalLocalePath(path, from, to)).toBe(expected);
    },
  );

  it.each([
    'https://evil.example/en/groups/00000000-0000-4000-8000-000000000000',
    '//evil.example/en/groups/00000000-0000-4000-8000-000000000000',
    '/\\evil.example/en/groups/00000000-0000-4000-8000-000000000000',
    '/en/../ar/groups/00000000-0000-4000-8000-000000000000',
    '/fr/groups/00000000-0000-4000-8000-000000000000',
  ])('rejects unsafe locale-switch path %s', path => {
    expect(switchInternalLocalePath(path, 'en', 'ar')).toBeNull();
  });
});

describe('switchLocaleReturnParams', () => {
  it('switches safe next and returnTo paths in both directions while keeping queries, fragments, and other filters', () => {
    const enToAr = switchLocaleReturnParams(
      new URLSearchParams([
        ['next', '/en/groups/00000000-0000-4000-8000-000000000000?tab=materials#files'],
        ['returnTo', '/en/classes/00000000-0000-4000-8000-000000000001?day=2#week'],
        ['subject', 'math'],
      ]),
      'en',
      'ar',
    );
    expect(enToAr.get('next')).toBe(
      '/ar/groups/00000000-0000-4000-8000-000000000000?tab=materials#files',
    );
    expect(enToAr.get('returnTo')).toBe(
      '/ar/classes/00000000-0000-4000-8000-000000000001?day=2#week',
    );
    expect(enToAr.get('subject')).toBe('math');

    const arToEn = switchLocaleReturnParams(
      new URLSearchParams([
        ['next', '/ar/groups/00000000-0000-4000-8000-000000000000?tab=details#about'],
        ['returnTo', '/ar/classes/00000000-0000-4000-8000-000000000001?day=3#week'],
      ]),
      'ar',
      'en',
    );
    expect(arToEn.get('next')).toBe(
      '/en/groups/00000000-0000-4000-8000-000000000000?tab=details#about',
    );
    expect(arToEn.get('returnTo')).toBe(
      '/en/classes/00000000-0000-4000-8000-000000000001?day=3#week',
    );
  });

  it('drops invalid external or malformed redirect targets', () => {
    const params = switchLocaleReturnParams(
      new URLSearchParams([
        ['next', 'https://evil.example/path'],
        ['returnTo', '//evil.example/path'],
        ['subject', 'science'],
      ]),
      'en',
      'ar',
    );
    expect(params.has('next')).toBe(false);
    expect(params.has('returnTo')).toBe(false);
    expect(params.get('subject')).toBe('science');
  });
});
