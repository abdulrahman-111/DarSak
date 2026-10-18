import {describe,it,expect} from 'vitest';
import {classView,classPage,classLessonView,classHref} from '@/features/student/class-workspace-domain';
describe('student class section navigation',()=>{
 it('uses separate class sections instead of the public discovery route',()=>{
  expect(classHref('en','class-id','teacher')).toBe('/en/student/classes/class-id?view=teacher');
  expect(classHref('ar','class-id')).toBe('/ar/student/classes/class-id');
  expect(classView('materials')).toBe('materials');
  expect(classView(['teacher'])).toBe('overview');
 });
 it('bounds pagination and normalizes lesson sections',()=>{
  expect(classPage(-2)).toBe(1);expect(classPage('Infinity')).toBe(1);expect(classPage('1000000')).toBe(50000);
  expect(classLessonView('history')).toBe('history');expect(classLessonView('invalid')).toBe('upcoming');
 });
});
