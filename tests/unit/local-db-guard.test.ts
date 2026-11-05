import { describe, expect, it } from 'vitest';
import { fixtureData } from '../e2e/support/data';
import { assertLocalMutationEnvironment } from '../e2e/support/local-db';

const localEnvironment = {
  E2E_DATABASE_URL: 'postgresql://postgres:local@127.0.0.1:54322/postgres',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  E2E_BASE_URL: 'http://127.0.0.1:3000',
};

describe('local E2E mutation guard', () => {
  it('keeps existing actors and the reserved admin index stable when adding accessTeacher', () => {
    const { actors, ids } = fixtureData('en-desktop');
    expect([
      actors.teacher.id,
      actors.student.id,
      actors.outsider.id,
      actors.passwordStudent.id,
      actors.notificationStudent.id,
      actors.liveNotificationStudent.id,
    ]).toEqual([
      'e2e00000-0000-4000-8000-000100000001',
      'e2e00000-0000-4000-8000-000100000002',
      'e2e00000-0000-4000-8000-000100000003',
      'e2e00000-0000-4000-8000-000100000004',
      'e2e00000-0000-4000-8000-000100000005',
      'e2e00000-0000-4000-8000-000100000007',
    ]);
    expect(actors.accessTeacher.id.endsWith('00000008')).toBe(true);
    expect(ids.accessTeacherGroupId).not.toBe(ids.groupId);
    expect(ids.accessTeacherLessonId).not.toBe(ids.futureLessonId);
    expect(actors.accessTeacher.id).not.toBe('e2e00000-0000-4000-8000-000100000006');
  });

  it('accepts PostgreSQL, API, and browser URLs on loopback', () => {
    expect(assertLocalMutationEnvironment(localEnvironment)).toBe(
      localEnvironment.E2E_DATABASE_URL,
    );
  });

  it('refuses a remote database before running any SQL', () => {
    expect(() =>
      assertLocalMutationEnvironment({
        ...localEnvironment,
        E2E_DATABASE_URL: 'postgresql://user:secret@db.example.test/postgres',
      }),
    ).toThrow(/non-loopback E2E_DATABASE_URL/);
  });

  it('refuses a remote Supabase API even when the database is local', () => {
    expect(() =>
      assertLocalMutationEnvironment({
        ...localEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toThrow(/non-loopback NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('refuses a remote browser origin even when the Supabase services are local', () => {
    expect(() =>
      assertLocalMutationEnvironment({
        ...localEnvironment,
        E2E_BASE_URL: 'https://production.example.test',
      }),
    ).toThrow(/non-loopback E2E_BASE_URL/);
  });
});
