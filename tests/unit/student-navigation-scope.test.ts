import {describe,it,expect} from 'vitest';
import {hasAdminWorkspaceNavigation,hasStudentWorkspaceNavigation,hasTeacherWorkspaceNavigation} from '@/components/navigation-domain';
describe('student workspace navigation',()=>{
 it('removes duplicate header links only where a full workspace navigation exists',()=>{
  expect(hasStudentWorkspaceNavigation('/en/student/classes/abc','en')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/ar/timetable','ar')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/en/teachers','en')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/en/account','en')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/en/account/security','en')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/ar/groups/abc','ar')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/en/teacher','en')).toBe(false);
  expect(hasStudentWorkspaceNavigation('/en/pricing','en')).toBe(false);
 });
});
describe('admin workspace navigation',()=>{
 it('hides the global header only on admin-shell and shared shell routes',()=>{
  expect(hasAdminWorkspaceNavigation('/en/admin','en')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/en/admin/users/abc','en')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/ar/notifications','ar')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/en/reports','en')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/en/account','en')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/en/account/security','en')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/en/teachers','en')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/en/groups/abc','en')).toBe(true);
  expect(hasAdminWorkspaceNavigation('/en/teacher','en')).toBe(false);
  expect(hasAdminWorkspaceNavigation('/en/pricing','en')).toBe(false);
 });
});
describe('teacher workspace navigation',()=>{
 it('replaces the header only on teacher workspace pages and shared pages with a teacher shell',()=>{
  expect(hasTeacherWorkspaceNavigation('/en/teacher','en')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/en/teacher/groups/abc','en')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/ar/notifications','ar')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/en/reports','en')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/en/account','en')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/en/account/security','en')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/en/teachers','en')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/en/groups/abc','en')).toBe(true);
  expect(hasTeacherWorkspaceNavigation('/en/admin','en')).toBe(false);
  expect(hasTeacherWorkspaceNavigation('/en/student','en')).toBe(false);
  expect(hasTeacherWorkspaceNavigation('/en/pricing','en')).toBe(false);
 });
});
