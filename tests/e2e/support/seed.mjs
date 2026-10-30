import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projects = ['en-desktop', 'ar-desktop', 'en-mobile', 'ar-mobile'];
const actorNames = ['teacher', 'student', 'outsider', 'passwordStudent', 'notificationStudent'];
const password = 'E2E-local-only-2026!';
const uuid = (kind, projectIndex, actorIndex = 0) =>
  `e2e${String(kind).padStart(5, '0')}-0000-4000-8000-${String(projectIndex).padStart(4, '0')}${String(actorIndex).padStart(8, '0')}`;

function fixtureData(projectName, projectIndex) {
  const actors = Object.fromEntries(
    actorNames.map((name, index) => [
      name,
      {
        id: uuid(0, projectIndex, index + 1),
        email: `${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}+${projectName}@e2e.invalid`,
        password,
      },
    ]),
  );
  return {
    actors,
    groupId: uuid(1, projectIndex),
    futureLessonId: uuid(2, projectIndex, 1),
    endedLessonId: uuid(2, projectIndex, 2),
    assignmentId: uuid(3, projectIndex),
    notificationId: uuid(4, projectIndex),
  };
}

function assertLoopbackDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`Refusing to seed non-loopback database host: ${url.hostname}`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('E2E_DATABASE_URL must use postgres:// or postgresql://.');
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function seedSql(projectName, projectIndex) {
  const data = fixtureData(projectName, projectIndex);
  const { teacher, student, outsider, passwordStudent, notificationStudent } = data.actors;
  const admin = {
    id: uuid(0, projectIndex, 6),
    email: `seed-admin+${projectName}@e2e.invalid`,
  };
  const users = [
    ...[teacher, student, outsider, passwordStudent, notificationStudent].map((actor, index) => {
      const role = index === 0 ? 'teacher' : 'student';
      const fullName = [
        'E2E Teacher',
        'E2E Student',
        'E2E Outsider',
        'E2E Password Student',
        'E2E Notification Student',
      ][index];
      return `('00000000-0000-0000-0000-000000000000', ${sqlLiteral(actor.id)}, 'authenticated', 'authenticated', ${sqlLiteral(actor.email)}, crypt(${sqlLiteral(password)}, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', ${sqlLiteral(JSON.stringify({ full_name: fullName, requested_role: role }))}::jsonb, now(), now(), '', '', '', '', '', '')`;
    }),
    `('00000000-0000-0000-0000-000000000000', ${sqlLiteral(admin.id)}, 'authenticated', 'authenticated', ${sqlLiteral(admin.email)}, crypt(${sqlLiteral(password)}, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"E2E fixture admin","requested_role":"student"}', now(), now(), '', '', '', '', '', '')`,
  ].join(',\n');
  const userIds = [
    teacher.id,
    student.id,
    outsider.id,
    passwordStudent.id,
    notificationStudent.id,
    admin.id,
  ]
    .map(sqlLiteral)
    .join(', ');
  return `begin;
set local search_path = public, extensions;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token) values ${users};
insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
select gen_random_uuid(),id,id::text,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',now(),now() from auth.users where id in (${userIds});
set local role service_role;
update public.profiles set role='admin' where id=${sqlLiteral(admin.id)};
select set_config('request.jwt.claim.sub',${sqlLiteral(admin.id)},true);
reset role;
update public.teacher_applications set legacy_approved=true,status='approved',reviewed_at=now(),reviewed_by=${sqlLiteral(teacher.id)} where teacher_id=${sqlLiteral(teacher.id)};
select public.admin_decide_teacher_review(teacher_id,request_id,'approved',null) from public.teacher_review_state where teacher_id=${sqlLiteral(teacher.id)};
update public.teacher_profiles set headline='Synthetic E2E teacher' where id=${sqlLiteral(teacher.id)};
update public.student_profiles set onboarding_required=false,onboarding_completed_at=now(),age_range='18_24',education_year='E2E Grade 12' where id in (${sqlLiteral(student.id)},${sqlLiteral(outsider.id)},${sqlLiteral(passwordStudent.id)},${sqlLiteral(notificationStudent.id)});
insert into public.teacher_specializations(teacher_id,offering_id)
select ${sqlLiteral(teacher.id)},id from public.offerings where node_id='00000000-0000-0000-0000-000000000021' and subject_id='00000000-0000-0000-0000-000000000101' and owner_teacher_id is null;
insert into public.groups(id,teacher_id,offering_id,name,description,capacity,status,location)
select ${sqlLiteral(data.groupId)},${sqlLiteral(teacher.id)},id,'E2E mathematics group','Synthetic browser workflow group.',20,'draft','Online'
from public.offerings where node_id='00000000-0000-0000-0000-000000000021' and subject_id='00000000-0000-0000-0000-000000000101' and owner_teacher_id is null;
insert into public.group_schedule_slots(group_id,weekday,start_time,end_time) values(${sqlLiteral(data.groupId)},1,'16:00','17:00');
select public.publish_group(${sqlLiteral(data.groupId)},null,null);
insert into public.group_learning_details(group_id,outcomes,prerequisites,delivery_mode,fee_egp,fee_basis,fee_includes)
values(${sqlLiteral(data.groupId)},'Solve algebra problems','Grade 10','online',150,'month','Practice materials');
insert into public.enrollments(group_id,student_id,status) values(${sqlLiteral(data.groupId)},${sqlLiteral(student.id)},'accepted');
insert into public.lessons(id,group_id,title,starts_at,ends_at,notes) values
(${sqlLiteral(data.futureLessonId)},${sqlLiteral(data.groupId)},'E2E upcoming lesson',now()+interval '7 days',now()+interval '7 days 1 hour','Synthetic future lesson'),
(${sqlLiteral(data.endedLessonId)},${sqlLiteral(data.groupId)},'E2E completed lesson',now()-interval '7 days',now()-interval '7 days'+interval '1 hour','Synthetic ended lesson');
insert into public.lesson_materials(lesson_id,kind,title,url,uploaded_by) values(${sqlLiteral(data.futureLessonId)},'link','E2E algebra resource','https://en.wikipedia.org/wiki/Elementary_algebra',${sqlLiteral(teacher.id)});
insert into public.group_assignments(id,group_id,title,instructions,resource_url,due_at) values(${sqlLiteral(data.assignmentId)},${sqlLiteral(data.groupId)},'E2E algebra assignment','Complete the practice questions.','https://en.wikipedia.org/wiki/Algebra',now()+interval '14 days');
insert into public.user_notifications(id,recipient_id,kind,event_key,payload) values(${sqlLiteral(data.notificationId)},${sqlLiteral(notificationStudent.id)},'lesson_rescheduled','e2e:${projectName}:lesson-notice',jsonb_build_object('lesson_id',${sqlLiteral(data.futureLessonId)},'group_id',${sqlLiteral(data.groupId)},'group_name','E2E mathematics group','title','E2E upcoming lesson','starts_at',now()+interval '7 days','ends_at',now()+interval '7 days 1 hour'));
reset role;
do $$ begin
 if not exists(select 1 from public.groups where id=${sqlLiteral(data.groupId)} and status='published') then raise exception 'E2E group seed failed: starter offering missing'; end if;
 if (select count(*) from public.enrollments where group_id=${sqlLiteral(data.groupId)} and status='accepted')<>1 then raise exception 'E2E enrollment seed failed'; end if;
end $$;
commit;
`;
}

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error('E2E_DATABASE_URL is required.');
assertLoopbackDatabaseUrl(databaseUrl);

const scratchDir = await mkdtemp(join(tmpdir(), 'darsak-e2e-seed-'));
try {
  for (const [index, projectName] of projects.entries()) {
    const sqlFile = join(scratchDir, `${projectName}.sql`);
    await writeFile(sqlFile, seedSql(projectName, index + 1), { mode: 0o600 });
    const result = spawnSync(
      'psql',
      [databaseUrl, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', sqlFile],
      {
        stdio: 'inherit',
        env: process.env,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Seeding ${projectName} failed with status ${result.status}.`);
  }
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
