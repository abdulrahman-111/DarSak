import { describe, expect, it } from 'vitest';
import { assertLocalMutationEnvironment } from '../e2e/support/local-db';

const localEnvironment = {
  E2E_DATABASE_URL: 'postgresql://postgres:local@127.0.0.1:54322/postgres',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  E2E_BASE_URL: 'http://127.0.0.1:3000',
};

describe('local E2E mutation guard', () => {
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
