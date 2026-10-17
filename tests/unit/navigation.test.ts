import { describe, expect, it } from 'vitest';
import { isActivePath } from '../../src/components/navigation-domain';
import { platformNavigation } from '@/components/platform/shell';

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

describe('account and workspace navigation', () => {
  it('keeps personal settings under Account while leaving admin management in the admin workspace', () => {
    const teacher = platformNavigation('en', 'teacher').map(item => item.href);
    const student = platformNavigation('ar', 'student').map(item => item.href);
    const admin = platformNavigation('en', 'admin').map(item => item.href);

    expect(teacher).toContain('/en/account');
    expect(teacher).not.toContain('/en/teacher/profile');
    expect(teacher).not.toContain('/en/teacher/application');
    expect(teacher).not.toContain('/en/teacher/access');
    expect(student).toContain('/ar/account');
    expect(student).not.toContain('/ar/student/profile');
    expect(admin).toContain('/en/admin/users');
    expect(admin).toContain('/en/admin/teachers');
    expect(admin).toContain('/en/account');
  });
});
