import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fixtureData } from './data';

type E2EEnvironment = {
  E2E_DATABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  E2E_BASE_URL?: string;
};

function loopbackHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  const octets = host.split('.').map(Number);
  return (
    octets.length === 4 &&
    octets[0] === 127 &&
    octets.every(value => Number.isInteger(value) && value >= 0 && value <= 255)
  );
}

function requireLocalUrl(value: string | undefined, label: string, protocols: string[]) {
  let url: URL;
  try {
    if (!value) throw new Error();
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid local URL.`);
  }
  if (!protocols.includes(url.protocol)) throw new Error(`${label} has an unexpected protocol.`);
  if (!loopbackHost(url.hostname)) throw new Error(`Refusing non-loopback ${label}.`);
  return url.toString().replace(/\/$/, '');
}

export function assertLocalMutationEnvironment(
  env: E2EEnvironment = {
    E2E_DATABASE_URL: process.env.E2E_DATABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    E2E_BASE_URL: process.env.E2E_BASE_URL,
  },
) {
  const databaseUrl = requireLocalUrl(env.E2E_DATABASE_URL, 'E2E_DATABASE_URL', [
    'postgres:',
    'postgresql:',
  ]);
  requireLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL', ['http:', 'https:']);
  requireLocalUrl(env.E2E_BASE_URL ?? 'http://127.0.0.1:3000', 'E2E_BASE_URL', ['http:', 'https:']);
  return databaseUrl;
}

const insertedRows = new Map<string, string>();

function targetActor(projectName: string) {
  const { actors, ids } = fixtureData(projectName);
  const actor = actors.liveNotificationStudent;
  const expectedEmail = `live-notification-student+${projectName}@e2e.invalid`;
  if (
    actor.id !== ids.liveNotificationStudentId ||
    actor.email !== expectedEmail ||
    !/^e2e00000-0000-4000-8000-\d{12}$/.test(actor.id)
  ) {
    throw new Error('The live notification fixture identity did not match its expected E2E actor.');
  }
  return actor;
}

function targetAccessTeacher(projectName: string) {
  const { actors, ids } = fixtureData(projectName);
  const actor = actors.accessTeacher;
  const expectedEmail = `access-teacher+${projectName}@e2e.invalid`;
  if (
    actor.id !== ids.accessTeacherId ||
    actor.email !== expectedEmail ||
    !/^e2e00000-0000-4000-8000-\d{12}$/.test(actor.id)
  ) {
    throw new Error('The teaching access fixture identity did not match its expected E2E actor.');
  }
  return { actor, ids };
}

function targetSeedAdmin(projectName: string) {
  const { ids } = fixtureData(projectName);
  return {
    id: ids.seedAdminId,
    email: `seed-admin+${projectName}@e2e.invalid`,
  };
}

function targetRatingsFixture(projectName: string) {
  const { actors, ids } = fixtureData(projectName);
  const teacher = actors.ratingsTeacher;
  const student = actors.ratingsStudent;
  if (
    teacher.id !==
      `e2e00000-0000-4000-8000-${projectName === 'en-desktop' ? '0001' : projectName === 'ar-desktop' ? '0002' : projectName === 'en-mobile' ? '0003' : '0004'}00000009` ||
    student.id !== teacher.id.replace(/00000009$/, '00000010') ||
    teacher.email !== `ratings-teacher+${projectName}@e2e.invalid` ||
    student.email !== `ratings-student+${projectName}@e2e.invalid` ||
    !/^00000148-0000-4000-8000-\d{12}$/.test(ids.ratingsGroupId)
  )
    throw new Error(
      'The dedicated ratings E2E actors or group did not match their reserved fixture IDs.',
    );
  return { teacher, student, ids, admin: targetSeedAdmin(projectName) };
}

type RatingsDecision = 'approve' | 'hide';

export async function ratingsFixtureState(projectName: string) {
  const databaseUrl = assertLocalMutationEnvironment();
  const { teacher, student, ids, admin } = targetRatingsFixture(projectName);
  const raw = runLocalSql(
    databaseUrl,
    `
do $$ begin
  if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=${sqlLiteral(student.id)} and u.email=${sqlLiteral(student.email)} and p.role='student' and p.status='active')
    or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id join public.teacher_profiles t on t.id=p.id
    where u.id=${sqlLiteral(teacher.id)} and u.email=${sqlLiteral(teacher.email)} and p.role='teacher' and p.status='active' and t.approved)
    or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=${sqlLiteral(admin.id)} and u.email=${sqlLiteral(admin.email)} and p.role='admin' and p.status='active') then
    raise exception 'Ratings E2E fixture actor identity mismatch' using errcode='42501'; end if;
end $$;
select jsonb_build_object(
 'feedback_id',f.id,'version',f.version,'status',f.status,
 'baseline_count',(select count(*) from dars_private.group_feedback b where b.group_id=${sqlLiteral(ids.ratingsGroupId)} and b.status='approved'),
 'pending_admin_notice',exists(select 1 from public.user_notifications n where n.recipient_id=${sqlLiteral(admin.id)} and n.kind='feedback_pending' and n.payload->>'group_id'=${sqlLiteral(ids.ratingsGroupId)})
)::text from dars_private.group_feedback f where f.group_id=${sqlLiteral(ids.ratingsGroupId)} and f.student_id=${sqlLiteral(student.id)};`,
  );
  try {
    return JSON.parse(raw) as {
      feedback_id: string;
      version: number;
      status: string;
      baseline_count: number;
      pending_admin_notice: boolean;
    };
  } catch {
    throw new Error('The dedicated ratings E2E fixture state was incomplete.');
  }
}

export async function moderateRatingsFeedback(
  projectName: string,
  decision: RatingsDecision,
  studentReason: string,
  privateNote: string,
) {
  const databaseUrl = assertLocalMutationEnvironment();
  const { teacher, student, ids, admin } = targetRatingsFixture(projectName);
  if (decision !== 'approve' && decision !== 'hide')
    throw new Error('Unsupported ratings fixture decision.');
  const output = runLocalSql(
    databaseUrl,
    `begin;
do $$ begin
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id join public.teacher_profiles t on t.id=p.id
   where u.id=${sqlLiteral(teacher.id)} and u.email=${sqlLiteral(teacher.email)} and p.role='teacher' and p.status='active' and t.approved)
   or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=${sqlLiteral(student.id)} and u.email=${sqlLiteral(student.email)} and p.role='student' and p.status='active')
   or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=${sqlLiteral(admin.id)} and u.email=${sqlLiteral(admin.email)} and p.role='admin' and p.status='active')
   or not exists(select 1 from dars_private.group_feedback f where f.group_id=${sqlLiteral(ids.ratingsGroupId)} and f.student_id=${sqlLiteral(student.id)})
 then raise exception 'Ratings E2E mutation identity mismatch' using errcode='42501'; end if;
end $$;
do $$ declare v_id uuid; v_version bigint; begin
 perform set_config('request.jwt.claim.sub',${sqlLiteral(admin.id)},true);
 perform set_config('request.jwt.claims',${sqlLiteral(JSON.stringify({ sub: admin.id, role: 'authenticated', aal: 'aal2' }))},true);
 select id,version into v_id,v_version from dars_private.group_feedback where group_id=${sqlLiteral(ids.ratingsGroupId)} and student_id=${sqlLiteral(student.id)} for update;
 perform public.moderate_group_feedback_with_reason(v_id,${sqlLiteral(decision)},${sqlLiteral(privateNote)},v_version,${sqlLiteral(studentReason)});
 perform set_config('request.jwt.claims','{}',true); perform set_config('request.jwt.claim.sub','',true);
end $$;
select version from dars_private.group_feedback where group_id=${sqlLiteral(ids.ratingsGroupId)} and student_id=${sqlLiteral(student.id)};
commit;`,
  );
  if (!/^\d+$/.test(output))
    throw new Error('Canonical ratings moderation did not return one resulting version.');
  return Number(output);
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runLocalSql(databaseUrl: string, sql: string) {
  const result = spawnSync(
    'psql',
    [
      databaseUrl,
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--quiet',
      '--tuples-only',
      '--no-align',
    ],
    { input: sql, encoding: 'utf8', env: process.env },
  );
  if (result.error || result.status !== 0)
    throw new Error('The targeted local E2E database operation failed.');
  return result.stdout.trim();
}

export async function insertLiveNotification(projectName: string): Promise<string> {
  const databaseUrl = assertLocalMutationEnvironment();
  const actor = targetActor(projectName);
  const id = randomUUID();
  const eventKey = `e2e:live-notification:${randomUUID()}`;
  const title = `E2E live notification ${id}`;
  const sql = `
begin;
do $$ begin
  perform 1 from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = ${sqlLiteral(actor.id)}
      and u.email = ${sqlLiteral(actor.email)}
      and p.role = 'student'
    for share of u, p;
  if not found then
    raise exception 'Live notification fixture identity mismatch' using errcode = '42501';
  end if;
end $$;
with inserted as (
  insert into public.user_notifications (id, recipient_id, kind, event_key, payload)
  values (
    ${sqlLiteral(id)}, ${sqlLiteral(actor.id)}, 'lesson_rescheduled', ${sqlLiteral(eventKey)},
    jsonb_build_object('title', ${sqlLiteral(title)}, 'starts_at', now() + interval '7 days')
  )
  returning id
)
select id from inserted;
commit;
`;
  if (runLocalSql(databaseUrl, sql) !== id)
    throw new Error('The live notification insert did not affect exactly one expected row.');
  insertedRows.set(`${projectName}:${id}`, actor.id);
  return id;
}

export async function deleteLiveNotification(projectName: string, id: string): Promise<void> {
  const databaseUrl = assertLocalMutationEnvironment();
  const actor = targetActor(projectName);
  const key = `${projectName}:${id}`;
  if (insertedRows.get(key) !== actor.id)
    throw new Error('Refusing to delete a notification that this helper did not insert.');
  const deleted = runLocalSql(
    databaseUrl,
    `begin;
do $$ begin
  perform 1 from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = ${sqlLiteral(actor.id)}
      and u.email = ${sqlLiteral(actor.email)}
      and p.role = 'student'
    for share of u, p;
  if not found then
    raise exception 'Live notification fixture identity mismatch' using errcode = '42501';
  end if;
end $$;
with deleted as (
  delete from public.user_notifications where id = ${sqlLiteral(id)} and recipient_id = ${sqlLiteral(actor.id)}
  returning 1
)
select count(*) from deleted;
commit;`,
  );
  if (deleted !== '1')
    throw new Error('The targeted live notification cleanup did not delete one row.');
  insertedRows.delete(key);
}

type TeachingAccessSnapshot = {
  approved: boolean;
  starts_at: string;
  expires_at: string;
  review_status: string;
  request_id: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  decline_reason: string | null;
};

type TeachingAccessChange = 'expire-legacy' | 'withdraw-approval';

function nullableSqlLiteral(value: string | null) {
  return value === null ? 'null' : sqlLiteral(value);
}

function assertFixtureIdentitySql(projectName: string) {
  const { actor } = targetAccessTeacher(projectName);
  return `
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id=u.id
    join public.teacher_profiles t on t.id=p.id
    join public.teacher_applications a on a.teacher_id=t.id
    join public.teacher_review_state r on r.teacher_id=t.id
    join dars_private.teacher_access_state s on s.teacher_id=t.id
    where u.id=${sqlLiteral(actor.id)} and u.email=${sqlLiteral(actor.email)}
      and p.role='teacher' and p.status='active'
  ) then
    raise exception 'Teaching access fixture identity mismatch' using errcode='42501';
  end if;`;
}

function assertSeedAdminSql(projectName: string) {
  const admin = targetSeedAdmin(projectName);
  return `
  if not exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=${sqlLiteral(admin.id)} and u.email=${sqlLiteral(admin.email)}
      and p.role='admin' and p.status='active'
  ) then
    raise exception 'Teaching access fixture admin mismatch' using errcode='42501';
  end if;`;
}

async function beginTeachingAccessChange(
  projectName: string,
  change: TeachingAccessChange,
): Promise<TeachingAccessSnapshot> {
  const databaseUrl = assertLocalMutationEnvironment();
  const { actor } = targetAccessTeacher(projectName);
  const admin = targetSeedAdmin(projectName);
  const withdraw = change === 'withdraw-approval';
  const output = runLocalSql(
    databaseUrl,
    `begin;
create temporary table task3_access_snapshot on commit drop as
select t.approved, s.starts_at, s.expires_at, r.status as review_status, r.request_id,
  r.requested_at, r.reviewed_at, r.reviewed_by, r.decline_reason
from auth.users u
join public.profiles p on p.id=u.id
join public.teacher_profiles t on t.id=p.id
join public.teacher_applications a on a.teacher_id=t.id
join public.teacher_review_state r on r.teacher_id=t.id
join dars_private.teacher_access_state s on s.teacher_id=t.id
where u.id=${sqlLiteral(actor.id)} and u.email=${sqlLiteral(actor.email)}
  and p.role='teacher' and p.status='active'
  and t.approved and a.legacy_approved and a.status='approved' and r.status='approved';
select jsonb_build_object(
  'approved', approved, 'starts_at', starts_at, 'expires_at', expires_at,
  'review_status', review_status, 'request_id', request_id, 'requested_at', requested_at,
  'reviewed_at', reviewed_at, 'reviewed_by', reviewed_by, 'decline_reason', decline_reason
)::text from task3_access_snapshot;
do $$ begin
  ${assertFixtureIdentitySql(projectName)}
  ${assertSeedAdminSql(projectName)}
  if (select count(*) from pg_temp.task3_access_snapshot) <> 1 then
    raise exception 'Teaching access snapshot did not contain exactly one approved fixture';
  end if;
  if dars_private.plan_quota_active() or exists (
    select 1 from dars_private.teacher_plan_entitlements
    where teacher_id=${sqlLiteral(actor.id)} and starts_at<=statement_timestamp()
      and expires_at>statement_timestamp()
  ) then
    raise exception 'Teaching access fixture must remain in the free phase';
  end if;
  perform 1 from auth.users u
    join public.profiles p on p.id=u.id
    join public.teacher_profiles t on t.id=p.id
    join public.teacher_applications a on a.teacher_id=t.id
    join public.teacher_review_state r on r.teacher_id=t.id
    join dars_private.teacher_access_state s on s.teacher_id=t.id
    where u.id=${sqlLiteral(actor.id)} and u.email=${sqlLiteral(actor.email)}
      and p.role='teacher' and p.status='active'
    for update of u,p,t,a,r,s;
end $$;
${
  withdraw
    ? `set local role service_role;
do $$ declare changed integer; begin
  perform set_config('request.jwt.claim.sub', ${sqlLiteral(admin.id)}, true);
  update public.teacher_profiles set approved=false where id=${sqlLiteral(actor.id)} and approved;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Teaching access approval withdrawal did not affect one row'; end if;
end $$;
reset role;`
    : ''
}
do $$ declare changed integer; begin
  update dars_private.teacher_access_state
    set starts_at=statement_timestamp()-interval '2 days', expires_at=statement_timestamp()-interval '1 day'
    where teacher_id=${sqlLiteral(actor.id)};
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Teaching access legacy expiry did not affect one row'; end if;
end $$;
commit;`,
  );
  let snapshot: TeachingAccessSnapshot;
  try {
    snapshot = JSON.parse(output) as TeachingAccessSnapshot;
  } catch {
    throw new Error('The teaching access fixture snapshot could not be read.');
  }
  if (
    typeof snapshot.approved !== 'boolean' ||
    typeof snapshot.starts_at !== 'string' ||
    typeof snapshot.expires_at !== 'string' ||
    typeof snapshot.review_status !== 'string' ||
    typeof snapshot.requested_at !== 'string'
  ) {
    throw new Error('The teaching access fixture snapshot was incomplete.');
  }
  return snapshot;
}

async function restoreTeachingAccess(
  projectName: string,
  snapshot: TeachingAccessSnapshot,
): Promise<void> {
  const databaseUrl = assertLocalMutationEnvironment();
  const { actor } = targetAccessTeacher(projectName);
  const admin = targetSeedAdmin(projectName);
  const reviewStatus = sqlLiteral(snapshot.review_status);
  const requestId = nullableSqlLiteral(snapshot.request_id);
  const requestedAt = sqlLiteral(snapshot.requested_at);
  const reviewedAt = nullableSqlLiteral(snapshot.reviewed_at);
  const reviewedBy = nullableSqlLiteral(snapshot.reviewed_by);
  const declineReason = nullableSqlLiteral(snapshot.decline_reason);
  runLocalSql(
    databaseUrl,
    `begin;
do $$ begin
  ${assertFixtureIdentitySql(projectName)}
  ${assertSeedAdminSql(projectName)}
  perform 1 from public.teacher_profiles t
    join public.profiles p on p.id=t.id
    join auth.users u on u.id=t.id
    join public.teacher_review_state r on r.teacher_id=t.id
    join dars_private.teacher_access_state s on s.teacher_id=t.id
    where t.id=${sqlLiteral(actor.id)} and u.email=${sqlLiteral(actor.email)}
      and p.role='teacher' and p.status='active'
    for update of t,p,u,r,s;
  if not found then raise exception 'Teaching access fixture disappeared during restoration'; end if;
end $$;
set local role service_role;
do $$ declare changed integer; begin
  perform set_config('request.jwt.claim.sub', ${sqlLiteral(admin.id)}, true);
  update public.teacher_profiles set approved=${snapshot.approved} where id=${sqlLiteral(actor.id)};
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Teaching approval restoration did not affect one row'; end if;
end $$;
reset role;
do $$ declare changed integer; begin
  update dars_private.teacher_access_state
    set starts_at=${sqlLiteral(snapshot.starts_at)}::timestamptz,
      expires_at=${sqlLiteral(snapshot.expires_at)}::timestamptz
    where teacher_id=${sqlLiteral(actor.id)};
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Teaching access state restoration did not affect one row'; end if;
  update public.teacher_review_state
    set status=${reviewStatus}, request_id=${requestId}::uuid, requested_at=${requestedAt}::timestamptz,
      reviewed_at=${reviewedAt}::timestamptz, reviewed_by=${reviewedBy}::uuid, decline_reason=${declineReason}
    where teacher_id=${sqlLiteral(actor.id)}
      and row(status,request_id,requested_at,reviewed_at,reviewed_by,decline_reason)
        is distinct from row(${reviewStatus},${requestId}::uuid,${requestedAt}::timestamptz,
          ${reviewedAt}::timestamptz,${reviewedBy}::uuid,${declineReason});
  get diagnostics changed = row_count;
  if changed > 1 then raise exception 'Teaching review restoration affected multiple rows'; end if;
  if not exists (
    select 1 from public.teacher_profiles t
    join public.teacher_review_state r on r.teacher_id=t.id
    join dars_private.teacher_access_state s on s.teacher_id=t.id
    where t.id=${sqlLiteral(actor.id)} and t.approved=${snapshot.approved}
      and s.starts_at=${sqlLiteral(snapshot.starts_at)}::timestamptz
      and s.expires_at=${sqlLiteral(snapshot.expires_at)}::timestamptz
      and row(r.status,r.request_id,r.requested_at,r.reviewed_at,r.reviewed_by,r.decline_reason)
        is not distinct from row(${reviewStatus},${requestId}::uuid,${requestedAt}::timestamptz,
          ${reviewedAt}::timestamptz,${reviewedBy}::uuid,${declineReason})
  ) then raise exception 'Teaching access fixture restoration did not match its snapshot'; end if;
end $$;
commit;`,
  );
}

async function withTeachingAccessChange(
  projectName: string,
  change: TeachingAccessChange,
  run: () => Promise<void>,
): Promise<void> {
  const snapshot = await beginTeachingAccessChange(projectName, change);
  try {
    await run();
  } finally {
    await restoreTeachingAccess(projectName, snapshot);
  }
}

export function withExpiredLegacyAccess(projectName: string, run: () => Promise<void>) {
  return withTeachingAccessChange(projectName, 'expire-legacy', run);
}

export function withWithdrawnTeachingAccess(projectName: string, run: () => Promise<void>) {
  return withTeachingAccessChange(projectName, 'withdraw-approval', run);
}

export async function hasAccessTeacherLesson(projectName: string, title: string): Promise<boolean> {
  const databaseUrl = assertLocalMutationEnvironment();
  const { actor, ids } = targetAccessTeacher(projectName);
  const result = runLocalSql(
    databaseUrl,
    `do $$ begin
  if not exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=${sqlLiteral(actor.id)} and u.email=${sqlLiteral(actor.email)}
      and p.role='teacher' and p.status='active'
  ) then raise exception 'Teaching access fixture identity mismatch' using errcode='42501'; end if;
end $$;
select exists (
  select 1 from public.lessons l join public.groups g on g.id=l.group_id
  where g.id=${sqlLiteral(ids.accessTeacherGroupId)} and g.teacher_id=${sqlLiteral(actor.id)}
    and l.title=${sqlLiteral(title)}
);`,
  );
  return result === 't';
}

export async function deleteAccessTeacherLessonIfPresent(
  projectName: string,
  title: string,
): Promise<void> {
  const databaseUrl = assertLocalMutationEnvironment();
  const { actor, ids } = targetAccessTeacher(projectName);
  const deleted = runLocalSql(
    databaseUrl,
    `begin;
do $$ begin
  if not exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=${sqlLiteral(actor.id)} and u.email=${sqlLiteral(actor.email)}
      and p.role='teacher' and p.status='active'
  ) then raise exception 'Teaching access fixture identity mismatch' using errcode='42501'; end if;
  if (
    select count(*) from public.lessons l
    where l.group_id=${sqlLiteral(ids.accessTeacherGroupId)} and l.title=${sqlLiteral(title)}
  ) > 1 then raise exception 'Teaching access fixture lesson title is not unique'; end if;
end $$;
with removed as (
  delete from public.lessons l using public.groups g
  where l.group_id=g.id and g.id=${sqlLiteral(ids.accessTeacherGroupId)}
    and g.teacher_id=${sqlLiteral(actor.id)} and l.title=${sqlLiteral(title)}
  returning l.id
)
select count(*) from removed;
commit;`,
  );
  if (!/^\d+$/.test(deleted) || Number(deleted) > 1)
    throw new Error('Teaching access lesson cleanup affected an unexpected number of rows.');
}
