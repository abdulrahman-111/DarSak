import { describe, expect, it } from 'vitest';
import { isActivePath } from '../../src/components/navigation-domain';

describe('navigation active route matching', () => {
  it('marks exact dashboard locations without treating every workspace route as Overview', () => {
    expect(isActivePath('/en/teacher', '/en/teacher')).toBe(true);
    expect(isActivePath('/en/teacher/groups', '/en/teacher', true)).toBe(false);
  });

  it('keeps a parent section active for its detail routes, but not similarly named routes', () => {
    expect(isActivePath('/ar/admin/teachers/abc', '/ar/admin/teachers')).toBe(true);
    expect(isActivePath('/ar/admin/teacher-settings', '/ar/admin/teachers')).toBe(false);
  });

  it('ignores query strings while matching the route', () => {
    expect(isActivePath('/en/register', '/en/register?role=teacher')).toBe(true);
  });
});
