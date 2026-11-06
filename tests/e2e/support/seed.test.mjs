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
}
