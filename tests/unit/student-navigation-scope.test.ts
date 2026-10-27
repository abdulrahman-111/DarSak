import { describe, it, expect } from 'vitest';
import {
  hasStudentWorkspaceNavigation,
  hasTeacherWorkspaceNavigation,
} from '@/components/navigation-domain';
describe('student workspace navigation', () => {
  it('removes duplicate header links only where a full workspace navigation exists', () => {
    expect(hasStudentWorkspaceNavigation('/en/student/classes/abc', 'en')).toBe(true);
    expect(hasStudentWorkspaceNavigation('/ar/timetable', 'ar')).toBe(true);
    expect(hasStudentWorkspaceNavigation('/en/teachers', 'en')).toBe(true);
    expect(hasStudentWorkspaceNavigation('/en/account', 'en')).toBe(true);
    expect(hasStudentWorkspaceNavigation('/en/account/security', 'en')).toBe(true);
    expect(hasStudentWorkspaceNavigation('/ar/groups/abc', 'ar')).toBe(true);
    expect(hasStudentWorkspaceNavigation('/en/teacher', 'en')).toBe(false);
    expect(hasStudentWorkspaceNavigation('/en/pricing', 'en')).toBe(false);
  });
});
describe('teacher workspace navigation', () => {
  it('replaces the header only on teacher workspace pages and shared pages with a teacher shell', () => {
    expect(hasTeacherWorkspaceNavigation('/en/teacher', 'en')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/en/teacher/groups/abc', 'en')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/ar/notifications', 'ar')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/en/reports', 'en')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/en/account', 'en')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/en/account/security', 'en')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/en/teachers', 'en')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/en/groups/abc', 'en')).toBe(true);
    expect(hasTeacherWorkspaceNavigation('/en/admin', 'en')).toBe(false);
    expect(hasTeacherWorkspaceNavigation('/en/student', 'en')).toBe(false);
    expect(hasTeacherWorkspaceNavigation('/en/pricing', 'en')).toBe(false);
  });
});
