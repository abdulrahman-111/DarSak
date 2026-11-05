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
    throw new Error('The targeted local E2E notification database operation failed.');
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
