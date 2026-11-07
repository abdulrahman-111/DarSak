import assert from 'node:assert/strict';
import test from 'node:test';
import { seedSql } from './seed.mjs';

const fixtures = [
  {
    project: 'en-desktop',
    index: 1,
    teacherId: 'e2e00000-0000-4000-8000-000100000008',
    groupId: 'e2e00001-0000-4000-8000-000100000008',
    lessonId: 'e2e00002-0000-4000-8000-000100000008',
  },
  {
    project: 'ar-desktop',
    index: 2,
    teacherId: 'e2e00000-0000-4000-8000-000200000008',
    groupId: 'e2e00001-0000-4000-8000-000200000008',
    lessonId: 'e2e00002-0000-4000-8000-000200000008',
  },
  {
    project: 'en-mobile',
    index: 3,
    teacherId: 'e2e00000-0000-4000-8000-000300000008',
    groupId: 'e2e00001-0000-4000-8000-000300000008',
    lessonId: 'e2e00002-0000-4000-8000-000300000008',
  },
  {
    project: 'ar-mobile',
    index: 4,
    teacherId: 'e2e00000-0000-4000-8000-000400000008',
    groupId: 'e2e00001-0000-4000-8000-000400000008',
    lessonId: 'e2e00002-0000-4000-8000-000400000008',
  },
];

for (const fixture of fixtures) {
  test(`generated seed SQL keeps admin assurance through publishing for ${fixture.project}`, () => {
    const sql = seedSql(fixture.project, fixture.index);
    const adminClaimsAt = sql.indexOf('"aal":"aal2"');
    const adminReviewAt = sql.indexOf('select public.admin_decide_teacher_review');
    const publishAt = sql.indexOf('select public.publish_group(');
    const finalDataWriteAt = sql.indexOf('insert into dars_private.group_feedback');
    const clearClaimsAt = sql.indexOf("select set_config('request.jwt.claims','{}',true);");
    const clearSubjectAt = sql.indexOf("select set_config('request.jwt.claim.sub','',true);");
    const finalResetAt = sql.indexOf('reset role;', clearSubjectAt);

    assert.ok(adminClaimsAt >= 0, 'synthetic admin claims include top-level aal2');
    assert.ok(adminClaimsAt < adminReviewAt, 'admin assurance is set before review RPCs');
    assert.ok(adminReviewAt < publishAt, 'review RPC runs before group publication');
    assert.ok(publishAt < finalDataWriteAt, 'group publication precedes the final seed write');
    assert.ok(finalDataWriteAt < clearClaimsAt, 'claims remain present through seed data writes');
    assert.ok(clearClaimsAt < clearSubjectAt, 'claims JSON is cleared before the subject');
    assert.ok(clearSubjectAt < finalResetAt, 'both claims are cleared before the final role reset');
    assert.ok(
      !sql.slice(adminClaimsAt, publishAt).includes("request.jwt.claims','{}"),
      'admin assurance is not cleared before publishing',
    );
  });

  test(`generated seed SQL includes the approved access teacher fixtures for ${fixture.project}`, () => {
    const sql = seedSql(fixture.project, fixture.index);
    const usersBlock = sql.match(
      /insert into auth\.users[^]*? values ([^]*?);\ninsert into auth\.identities/,
    )?.[1];
    assert.ok(usersBlock, 'auth.users insert is present');
    const actorRow = usersBlock.split(',\n').find(row => row.includes(`'${fixture.teacherId}'`));
    assert.ok(actorRow, 'accessTeacher has an auth.users row');
    assert.ok(actorRow.includes(`access-teacher+${fixture.project}@e2e.invalid`));
    assert.ok(actorRow.includes('"requested_role":"teacher"'));
    assert.ok(actorRow.includes('E2E Access Teacher'));

    assert.ok(
      sql.includes(
        `select '${fixture.groupId}','${fixture.teacherId}',id,'E2E access control group'`,
      ),
      'the dedicated access group uses defined actor and group IDs',
    );
    assert.ok(
      sql.includes(`values('${fixture.lessonId}','${fixture.groupId}','E2E access fixture lesson'`),
      'the dedicated access lesson uses defined lesson and group IDs',
    );
    assert.ok(!sql.includes('undefined'), 'no missing fixture ID reaches generated SQL');
  });

  test(`ratings fixtures use the reserved actors, low group ID, and isolated review cohort for ${fixture.project}`, () => {
    const sql = seedSql(fixture.project, fixture.index);
    const projectIndex = String(fixture.index).padStart(4, '0');
    const ratingsTeacherId = `e2e00000-0000-4000-8000-${projectIndex}00000009`;
    const ratingsStudentId = `e2e00000-0000-4000-8000-${projectIndex}00000010`;
    const ratingsGroupId = `00000148-0000-4000-8000-${projectIndex}00000001`;
    const usersBlock = sql.match(
      /insert into auth\.users[^]*? values ([^]*?);\ninsert into auth\.identities/,
    )?.[1];
    assert.ok(usersBlock);
    assert.ok(usersBlock.includes(`'${ratingsTeacherId}'`));
    assert.ok(usersBlock.includes(`ratings-teacher+${fixture.project}@e2e.invalid`));
    assert.ok(usersBlock.includes(`'${ratingsStudentId}'`));
    assert.ok(usersBlock.includes(`ratings-student+${fixture.project}@e2e.invalid`));
    assert.ok(
      sql.includes(
        `select '${ratingsGroupId}','${ratingsTeacherId}',id,'E2E Ratings Algebra Group'`,
      ),
    );
    assert.ok(sql.includes(`'${ratingsGroupId}','${ratingsStudentId}','accepted'`));
    assert.ok(sql.includes('E2E first ended ratings lesson'));
    assert.ok(sql.includes('E2E second ended ratings lesson'));
    assert.ok(sql.includes("'absent'"));
    assert.ok(sql.includes('Synthetic baseline review from the third fixture student.'));
    assert.ok(!sql.includes('undefined'));
  });

  test(`meeting fixtures use the reserved actors, isolated group, and inherited-link lesson for ${fixture.project}`, () => {
    const sql = seedSql(fixture.project, fixture.index);
    const projectIndex = String(fixture.index).padStart(4, '0');
    const teacherId = `e2e00000-0000-4000-8000-${projectIndex}00000011`;
    const studentId = `e2e00000-0000-4000-8000-${projectIndex}00000012`;
    const groupId = `00000145-0000-4000-8000-${projectIndex}00000001`;
    const lessonId = `00000145-0000-4000-8000-${projectIndex}00000002`;
    const usersBlock = sql.match(
      /insert into auth\.users[^]*? values ([^]*?);\ninsert into auth\.identities/,
    )?.[1];
    assert.ok(usersBlock);
    assert.ok(usersBlock.includes(`'${teacherId}'`));
    assert.ok(usersBlock.includes(`meeting-teacher+${fixture.project}@e2e.invalid`));
    assert.ok(usersBlock.includes('"requested_role":"teacher"'));
    assert.ok(usersBlock.includes('E2E Meeting Teacher'));
    assert.ok(usersBlock.includes(`'${studentId}'`));
    assert.ok(usersBlock.includes(`meeting-student+${fixture.project}@e2e.invalid`));
    assert.ok(usersBlock.includes('E2E Meeting Student'));
    assert.ok(sql.includes(`'${groupId}','${teacherId}',id,'E2E meeting links group'`));
    assert.ok(sql.includes(`values('${lessonId}','${groupId}','E2E meeting links lesson'`));
    assert.ok(sql.includes(`'${groupId}','${studentId}','accepted'`));
    assert.ok(sql.includes(`now()+interval '5 minutes',now()+interval '65 minutes'`));
    assert.ok(
      sql.includes(
        `exists(select 1 from dars_private.lesson_meetings where lesson_id='${lessonId}' and teacher_id='${teacherId}' and manual_url is not null)`,
      ),
      'the private override check reads its private table rather than a public lesson column',
    );
    assert.ok(
      !sql.includes('and manual_url is null'),
      'the public lessons row has no private URL field',
    );
    assert.ok(!sql.includes('undefined'));
  });
}

test('student recommendation fixture matches the canonical Mathematics subject label', () => {
  const sql = seedSql('en-desktop', 1);
  assert.ok(
    sql.includes("set interests=array['Mathematics'],learning_goal='Practice mathematics'"),
    'the student matching signal uses the catalog subject label read by the matching RPC',
  );
  assert.ok(
    sql.includes("'E2E meeting links group'"),
    'an un-enrolled published Mathematics group is available',
  );
});

for (const fixture of fixtures) {
  test(`viewer badge actor is isolated from the shared student for ${fixture.project}`, () => {
    const sql = seedSql(fixture.project, fixture.index);
    const projectIndex = String(fixture.index).padStart(4, '0');
    const viewerStudentId = `e2e00000-0000-4000-8000-${projectIndex}00000013`;
    const unreadId = `e2e00004-0000-4000-8000-${projectIndex}00000013`;
    const groupId = `e2e00001-0000-4000-8000-${projectIndex}00000000`;
    const usersBlock = sql.match(
      /insert into auth\.users[^]*? values ([^]*?);\ninsert into auth\.identities/,
    )?.[1];

    assert.ok(usersBlock, 'auth.users insert is present');
    const viewerRow = usersBlock.split(',\n').find(row => row.includes(`'${viewerStudentId}'`));
    assert.ok(viewerRow, 'viewerStudent has a distinct auth.users row at actor index 13');
    assert.ok(viewerRow.includes(`viewer-student+${fixture.project}@e2e.invalid`));
    assert.ok(viewerRow.includes('"requested_role":"student"'));
    assert.ok(viewerRow.includes('E2E Viewer Student'));
    assert.ok(
      sql.includes(`values('${groupId}','${viewerStudentId}','accepted')`),
      'viewerStudent is accepted into the base Mathematics group',
    );
    assert.ok(
      sql.includes(
        `values('${unreadId}','${viewerStudentId}','lesson_rescheduled','e2e:${fixture.project}:viewer-unread'`,
      ),
      'the known unread notification is addressed to viewerStudent at fixed actor index 13',
    );
    assert.ok(
      sql.includes(
        `values('e2e00004-0000-4000-8000-${projectIndex}00000001','e2e00000-0000-4000-8000-${projectIndex}00000002','lesson_rescheduled','e2e:${fixture.project}:student-unread'`,
      ),
      'the existing shared student notification remains independently seeded',
    );
    assert.ok(
      !sql.includes(
        `'${viewerStudentId}','lesson_rescheduled','e2e:${fixture.project}:student-unread'`,
      ),
    );
    assert.ok(
      !sql.includes(`'e2e00004-0000-4000-8000-${projectIndex}00000001','${viewerStudentId}'`),
    );
    assert.ok(!sql.includes('undefined'));
  });
}
