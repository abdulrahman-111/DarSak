import { describe, expect, it } from 'vitest';
import { isActivePath, isWorkspaceItemActive } from '../../src/components/navigation-domain';
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

  it('marks contextual routes active on their parent navigation item', () => {
    expect(
      isWorkspaceItemActive('/en/student/recommendations', {
        href: '/en/teachers',
        activePaths: ['/en/student/recommendations'],
      }),
    ).toBe(true);
    expect(
      isWorkspaceItemActive('/en/student/bookings', {
        href: '/en/timetable',
        activePaths: ['/en/student/bookings'],
      }),
    ).toBe(true);
    expect(
      isWorkspaceItemActive('/en/student/booking-history', {
        href: '/en/timetable',
        activePaths: ['/en/student/bookings'],
      }),
    ).toBe(false);
  });
});

describe('account and workspace navigation', () => {
  it('keeps personal settings under Account and excludes administrator routes', () => {
    const teacher = platformNavigation('en', 'teacher').map(item => item.href);
    const student = platformNavigation('ar', 'student').map(item => item.href);

    expect(teacher).toContain('/en/account');
    expect(teacher).not.toContain('/en/teacher/profile');
    expect(teacher).not.toContain('/en/teacher/application');
    expect(teacher).not.toContain('/en/teacher/access');
    expect(student).toContain('/ar/account');
    expect(student).not.toContain('/ar/student/profile');
    expect([...teacher, ...student].some(path => path.includes('/admin'))).toBe(false);
  });

  it('orders teacher tasks around teaching work with direct calendar and enrollment labels', () => {
    const teacher = platformNavigation('en', 'teacher');
    expect(teacher.map(item => item.label)).toEqual([
      'Home',
      'Groups',
      'Calendar',
      'Requests',
      'Students',
      'Subjects & categories',
      'Feedback',
      'Notifications',
      'My account',
      'Report a problem',
    ]);
    expect(teacher.map(item => item.href)).toEqual([
      '/en/teacher',
      '/en/teacher/groups',
      '/en/teacher/lessons',
      '/en/teacher/requests',
      '/en/teacher/students',
      '/en/teacher/catalogue',
      '/en/teacher/feedback',
      '/en/notifications',
      '/en/account',
      '/en/reports',
    ]);
    expect(teacher.filter(item => item.primary).map(item => item.label)).toEqual([
      'Home',
      'Groups',
      'Calendar',
      'Requests',
    ]);
    expect(teacher.map(item => item.href)).not.toContain('/en/teacher/bookings');
  });

  it('keeps bookings and group suggestions out of global links and maps them to their parent item', () => {
    const student = platformNavigation('en', 'student');
    const teacher = platformNavigation('ar', 'teacher');
    expect(student.map(item => item.href)).not.toContain('/en/student/bookings');
    expect(student.map(item => item.href)).not.toContain('/en/student/recommendations');
    expect(student.find(item => item.href === '/en/timetable')?.activePaths).toContain(
      '/en/student/bookings',
    );
    expect(student.find(item => item.href === '/en/teachers')?.activePaths).toContain(
      '/en/student/recommendations',
    );
    expect(teacher.find(item => item.href === '/ar/teacher/lessons')?.activePaths).toContain(
      '/ar/teacher/bookings',
    );
  });
});
