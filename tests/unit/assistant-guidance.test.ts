import { describe, expect, it } from 'vitest';
import { findGuidanceTopics, getGuidanceTopics } from '@/features/assistant/guidance';
import type { AssistantAccess } from '@/features/assistant/domain';

const student: AssistantAccess = { role: 'student', canTeach: false };

describe('role-aware local assistant guidance', () => {
  it('filters routes by role and teaching access', () => {
    const studentTopics = getGuidanceTopics('en', student);
    expect(studentTopics.flatMap(topic => topic.links.map(link => link.href))).toContain(
      '/en/student/classes',
    );
    expect(studentTopics.flatMap(topic => topic.links.map(link => link.href))).not.toContain(
      '/en/teacher/groups/new',
    );

    const pendingTeacher = getGuidanceTopics('en', { role: 'teacher', canTeach: false });
    const pendingPaths = pendingTeacher.flatMap(topic => topic.links.map(link => link.href));
    expect(pendingPaths).toContain('/en/account/application');
    expect(pendingPaths).toContain('/en/account/teaching-access');
    expect(pendingPaths).not.toContain('/en/teacher/groups');

    const activeTeacherPaths = getGuidanceTopics('ar', { role: 'teacher', canTeach: true }).flatMap(
      topic => topic.links.map(link => link.href),
    );
    expect(activeTeacherPaths).toContain('/ar/teacher/groups/new');
    expect(activeTeacherPaths).toContain('/ar/teacher/requests');
  });

  it('keeps a single result for every role-aware topic', () => {
    for (const access of [
      student,
      { role: 'teacher' as const, canTeach: false },
      { role: 'teacher' as const, canTeach: true },
      { role: 'admin' as const, canTeach: false },
    ]) {
      const topics = getGuidanceTopics('en', access);
      expect(new Set(topics.map(topic => topic.id)).size).toBe(topics.length);
    }
  });

  it('matches Arabic security questions after normalizing letter forms and diacritics', () => {
    const results = findGuidanceTopics('كَيْفَ أُغَيِّرُ كَلِمَةَ المُرُور؟', 'ar', student);
    expect(results.some(topic => topic.id === 'security')).toBe(true);
  });

  it('matches English synonyms and ranks the most relevant topic first', () => {
    const results = findGuidanceTopics('I forgot my password, how do I reset it?', 'en', student);
    expect(results[0]?.id).toBe('security');
  });

  it('returns no matches for arbitrary or overlong questions without echoing them', () => {
    expect(findGuidanceTopics('qzxv unknown topic', 'en', student)).toEqual([]);
    expect(findGuidanceTopics('password '.repeat(30), 'en', student)).toEqual([]);
  });

  it('builds every guidance link from the approved static routes', () => {
    const allowed = new Set([
      '/account',
      '/account/security',
      '/reports',
      '/notifications',
      '/help',
      '/teachers',
      '/account/learning-profile',
      '/student/classes',
      '/timetable',
      '/student/materials',
      '/student/saved',
      '/teacher/groups/new',
      '/teacher/groups',
      '/teacher/requests',
      '/teacher/lessons',
      '/teacher/students',
      '/account/application',
      '/account/teaching-access',
      '/account/profile',
      '/admin/teachers',
      '/admin/users',
      '/admin/groups',
      '/admin/reports',
    ]);
    for (const topic of getGuidanceTopics('en', { role: 'admin', canTeach: true })) {
      for (const link of topic.links) {
        expect(link.href.startsWith('/en/')).toBe(true);
        expect(allowed.has(link.href.slice(3))).toBe(true);
        expect(link.href).not.toContain('?');
      }
    }
  });
});
