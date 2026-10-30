import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeActionSource,
  analyzeNewOrChangedActionSource,
} from '../../scripts/server-action-guard.mjs';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/server-action-guard/${name}.fixture`, import.meta.url), 'utf8');

describe('server action guard scan', () => {
  it('detects a newly exported unguarded action', () => {
    const baseline = `export async function existingAction() { return 'ok'; }`;
    const findings = analyzeNewOrChangedActionSource(
      `${baseline}\n${fixture('unguarded.actions')}`,
      baseline,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'newlyAddedAction',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('detects a mutation that has no schema parse before it', () => {
    const baseline = `export async function existingAction() { return 'ok'; }`;
    const findings = analyzeNewOrChangedActionSource(
      `${baseline}\n${fixture('unvalidated.actions')}`,
      baseline,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'unvalidatedAction',
        rule: 'schema-before-mutation',
      }),
    );
  });

  it('accepts explicit public auth actions and guarded validated actions', () => {
    const findings = analyzeActionSource(
      `
        import { loginSchema } from './domain';
        export async function loginAction(form: FormData) {
          const parsed = loginSchema.safeParse(Object.fromEntries(form));
          if (!parsed.success) return { error: 'invalid' };
          const db = await createClient();
          return db.auth.signInWithPassword(parsed.data);
        }
        export async function saveAction(form: FormData) {
          const parsed = saveSchema.safeParse(Object.fromEntries(form));
          if (!parsed.success) return { error: 'invalid' };
          const db = await createClient();
          const { data: { user } } = await db.auth.getUser();
          if (!user) return { error: 'unauthorized' };
          return db.from('items').insert(parsed.data);
        }
      `,
      'src/features/auth/actions.ts',
    );

    expect(findings).toEqual([]);
  });

  it('does not exempt an undocumented auth action from the authorization rule', () => {
    const findings = analyzeActionSource(
      `
        export async function newlyAddedAuthAction() {
          const db = await createClient();
          return db.auth.signOut({ scope: 'local' });
        }
      `,
      'src/features/auth/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'newlyAddedAuthAction',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('requires nullable identity helper results to be rejected before database access', () => {
    const unguarded = analyzeActionSource(
      `
        import { viewer } from '@/features/student/data';
        export async function ignoredViewerAction() {
          await viewer();
          const db = await createClient();
          return db.from('items').select('id');
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(unguarded).toContainEqual(
      expect.objectContaining({
        action: 'ignoredViewerAction',
        rule: 'authorization-before-database',
      }),
    );

    const guarded = analyzeActionSource(
      `
        import { viewer } from '@/features/student/data';
        export async function checkedViewerAction() {
          const me = await viewer();
          if (!me) return;
          const db = await createClient();
          return db.from('items').select('id');
        }
      `,
      'src/features/example/actions.ts',
    );
    expect(guarded).toEqual([]);
  });

  it('does not trust a local identity helper that queries the database before its guard', () => {
    const findings = analyzeActionSource(
      `
        async function unsafeViewer() {
          const db = await createClient();
          await db.from('profiles').select('id');
          const { data: { user } } = await db.auth.getUser();
          if (!user) return null;
          return { db, user };
        }
        export async function saveAction() {
          const me = await unsafeViewer();
          if (!me) return;
          const db = await createClient();
          return db.from('items').update({ value: 'saved' });
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'saveAction',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('requires a documented helper guard call to be awaited', () => {
    const findings = analyzeActionSource(
      `
        import { requireAdminActor } from '@admin/lib/access';
        export async function actionWithoutAwait() {
          requireAdminActor('en');
          const db = await createClient();
          return db.from('items').select('id');
        }
      `,
      'apps/admin/src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'actionWithoutAwait',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('does not count a required helper whose rejection is swallowed by a catch', () => {
    const findings = analyzeActionSource(
      `
        import { requireAdminActor } from '@admin/lib/access';
        export async function swallowedGuard() {
          try {
            await requireAdminActor('en');
          } catch {}
          const db = await createClient();
          return db.from('items').select('id');
        }
      `,
      'apps/admin/src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'swallowedGuard',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('does not trust a local helper whose rejection returns undefined', () => {
    const findings = analyzeActionSource(
      `
        async function localViewer() {
          const db = await createClient();
          const { data: { user } } = await db.auth.getUser();
          if (!user) return;
          return { db, user };
        }
        export async function actionUsingLocalViewer() {
          const me = await localViewer();
          if (!me) return;
          const db = await createClient();
          return db.from('items').select('id');
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'actionUsingLocalViewer',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('rejects wrong-polarity and getSession-only inline checks', () => {
    const findings = analyzeActionSource(
      `
        export async function wrongPolarity() {
          const db = await createClient();
          const { data: { user } } = await db.auth.getUser();
          if (user) return;
          return db.from('items').select('id');
        }
        export async function sessionOnly() {
          const db = await createClient();
          const { data: { session } } = await db.auth.getSession();
          if (!session) return;
          return db.from('items').select('id');
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'wrongPolarity',
          rule: 'authorization-before-database',
        }),
        expect.objectContaining({
          action: 'sessionOnly',
          rule: 'authorization-before-database',
        }),
      ]),
    );
  });

  it('does not treat strict undefined as a missing user check', () => {
    const findings = analyzeActionSource(
      `
        export async function undefinedOnlyCheck() {
          const db = await createClient();
          const { data: { user } } = await db.auth.getUser();
          if (user === undefined) return;
          return db.from('items').select('id');
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'undefinedOnlyCheck',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('does not let an uncalled nested guard authorize its containing action', () => {
    const findings = analyzeActionSource(
      `
        import { requireTeachingAccess } from '@/components/platform/access';
        export async function nestedGuardDoesNotAuthorizeAction() {
          async function nestedGuard() {
            await requireTeachingAccess('en');
            const db = await createClient();
            const { data: { user } } = await db.auth.getUser();
            if (!user) return;
          }
          const db = await createClient();
          return db.from('items').select('id');
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'nestedGuardDoesNotAuthorizeAction',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('does not let an uncalled nested parser validate the containing action', () => {
    const findings = analyzeActionSource(
      `
        export async function nestedParserDoesNotValidateAction(form: FormData) {
          const db = await createClient();
          const { data: { user } } = await db.auth.getUser();
          if (!user) return;
          function parseUnusedForm() {
            return itemSchema.parse(Object.fromEntries(form));
          }
          return db.from('items').update({ value: String(form.get('value')) });
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'nestedParserDoesNotValidateAction',
        rule: 'schema-before-mutation',
      }),
    );
  });

  it('rechecks an action when a referenced import changes module', () => {
    const baseline = `
      import { requireAdminActor as requireActor } from '@admin/lib/access';
      export async function saveAction() {
        const actor = await requireActor('en');
        if (!actor) return;
        const db = await createClient();
        return db.from('items').select('id');
      }
    `;
    const current = baseline.replace('@admin/lib/access', './untrusted');
    const findings = analyzeNewOrChangedActionSource(
      current,
      baseline,
      'apps/admin/src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'saveAction',
        rule: 'authorization-before-database',
      }),
    );
  });

  it('rejects authorization after database access and schema validation after a mutation', () => {
    const findings = analyzeActionSource(
      `
        export async function lateValidationAction(form: FormData) {
          const db = await createClient();
          await db.from('items').select('id');
          const { data: { user } } = await db.auth.getUser();
          if (!user) return;
          await db.from('items').update({ from: form.get('from') });
          const parsed = itemSchema.safeParse(Object.fromEntries(form));
          if (!parsed.success) return;
          return db.from('items').update(parsed.data);
        }
      `,
      'src/features/example/actions.ts',
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'lateValidationAction',
        rule: 'authorization-before-database',
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        action: 'lateValidationAction',
        rule: 'schema-before-mutation',
      }),
    );
  });
});
