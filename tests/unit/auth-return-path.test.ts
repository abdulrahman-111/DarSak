import { describe, expect, it } from 'vitest';
import { loginRedirectPath, safeLoginReturnPath } from '@/features/auth/return-path';

const groupId = 'A70EA958-E2D5-4C9C-90D1-4E001D9AF93C';

describe('login return paths', () => {
  it('allows same-locale group and class UUID paths for English and Arabic', () => {
    expect(safeLoginReturnPath('en', `/en/groups/${groupId}`)).toBe(`/en/groups/${groupId}`);
    expect(safeLoginReturnPath('en', `/en/classes/${groupId.toLowerCase()}`)).toBe(`/en/classes/${groupId.toLowerCase()}`);
    expect(safeLoginReturnPath('en', '/en/groups/00000000-0000-4000-A000-000000000000')).toBe('/en/groups/00000000-0000-4000-A000-000000000000');
    expect(safeLoginReturnPath('ar', `/ar/groups/${groupId}`)).toBe(`/ar/groups/${groupId}`);
    expect(safeLoginReturnPath('ar', `/ar/classes/${groupId.toLowerCase()}`)).toBe(`/ar/classes/${groupId.toLowerCase()}`);
  });

  it('falls back to the same-locale dashboard for invalid or repeated next values', () => {
    expect(loginRedirectPath('en', undefined)).toBe('/en/dashboard');
    expect(loginRedirectPath('ar', ['/ar/groups/00000000-0000-4000-8000-000000000000', '/ar/groups/00000000-0000-4000-8000-000000000001'])).toBe('/ar/dashboard');
    expect(loginRedirectPath('en', '/en/groups/not-a-uuid')).toBe('/en/dashboard');
  });

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
