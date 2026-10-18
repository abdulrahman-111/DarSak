import {describe,it,expect} from 'vitest';
import {hasStudentWorkspaceNavigation} from '@/components/navigation-domain';
describe('student workspace navigation',()=>{
 it('removes duplicate header links only where a full workspace navigation exists',()=>{
  expect(hasStudentWorkspaceNavigation('/en/student/classes/abc','en')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/ar/timetable','ar')).toBe(true);
  expect(hasStudentWorkspaceNavigation('/en/teachers','en')).toBe(false);
  expect(hasStudentWorkspaceNavigation('/en/account','en')).toBe(false);
  expect(hasStudentWorkspaceNavigation('/en/teacher','en')).toBe(false);
 });
});
