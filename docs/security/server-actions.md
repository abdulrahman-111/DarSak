# Server action guard scan

`npm run actions:guard -- --base origin/main` inventories directly exported functions and
function-valued exports in
`src/features/**/actions.ts` and `apps/admin/src/**/actions.ts`. It checks new or changed exported
actions against the selected base: a recognized authentication guard must appear before direct
database access, and a Zod-style `.parse()` or `.safeParse()` must appear before direct table
mutations (`insert`, `update`, `delete`, or `upsert`). CI fetches the pull request base and runs the
same scan. Referenced imports are part of the action baseline, so changing a helper's import source
rechecks that action. The unit tests include new-export unguarded and unvalidated negative controls,
so either shape fails the scan.

Existing exported actions that have not changed are inventoried but not rechecked, which keeps
this incremental guard from turning current legacy findings into unrelated failures. The scan does
not claim that the existing action inventory is fully compliant.

The public authentication actions below intentionally do not require an existing signed-in user.
They remain schema/input-validated in their action bodies where applicable:

- `src/features/auth/actions.ts`: `loginAction`, `signupAction`, `googleSignInAction`,
  `forgotPasswordAction`, `resendConfirmationAction`, `verifySignupCodeAction`, and `logoutAction`.
- `apps/admin/src/app/[locale]/login/actions.ts`: `loginAction` and `logoutAction`.

The scanner only trusts awaited calls to these reviewed identity helpers when imported from the
listed modules. For helpers that can return `null`, it requires a recognized missing-value check
that returns or throws before database access: `getRequestViewer` from
`src/features/platform/request-viewer.ts`, `viewer` from `src/features/student/data.ts`,
`getVerifiedUser` and `getVerifiedRecoveryUser` from `src/lib/supabase/server.ts`, and
`getAdminActor` from `apps/admin/src/lib/access.ts`. It treats `teacherViewer`,
`requireTeachingAccess`, and `requireAdminActor` as helpers that redirect or otherwise reject
unauthorized callers. Calls swallowed by a local `try/catch` do not count. Local helper bodies are
not inferred as guards. Inline checks are recognized only for an awaited `.auth.getUser()` result
followed by a missing-user return or throw; `.auth.getSession()` is not a guard.

This is a syntactic safety net, not proof of authorization. It does not establish role, ownership,
or resource-level access control; those remain enforced by the action implementation and database
policies. It treats `.rpc()` as database access for guard ordering, but does not determine whether an
RPC mutates data or validate its arguments. It does not inspect storage operations, indirect writes
in called services, full conditional control flow, or aliases that hide database operations. A
parsed schema call is evidence of validation in the action body, not proof that its result reaches
the mutation. Changes to a helper implementation do not automatically recheck dependent actions if
their import binding is unchanged, so revalidate the explicit helper contracts when those
implementations change. Keep action bodies simple and review these cases normally.
