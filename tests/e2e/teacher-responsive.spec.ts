import { expect, fixtureData, test } from './support/fixtures';

test('weekly schedule editor remains usable at 320px', async ({ teacherPage }, testInfo) => {
  const { groupId } = fixtureData(testInfo.project.name).ids;
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const ar = locale === 'ar';
  await teacherPage.setViewportSize({ width: 320, height: 844 });
  await teacherPage.goto(`/${locale}/teacher/groups/${groupId}#schedule`);

  const scheduleHeading = teacherPage.getByRole('heading', {
    name: ar ? 'الجدول الأسبوعي' : 'Weekly schedule',
  });
  await expect(scheduleHeading).toBeVisible();
  await expect
    .poll(() => teacherPage.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);

  await teacherPage.getByRole('link', { name: ar ? /إضافة موعد/ : /Add time/ }).click();
  const weekday = teacherPage.getByLabel(ar ? 'اليوم' : 'Weekday');
  const start = teacherPage.getByLabel(ar ? 'وقت البداية' : 'Start time');
  const end = teacherPage.getByLabel(ar ? 'وقت النهاية' : 'End time');
  const save = teacherPage.getByRole('button', { name: ar ? 'حفظ الموعد' : 'Save time' });
  await expect(weekday).toBeVisible();
  await start.fill('10:00');
  await end.fill('11:00');
  await expect(save).toBeVisible();
  await expect
    .poll(() => teacherPage.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);
  for (const control of [weekday, start, end, save]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
});

test('teacher groups use a table on desktop and cards on mobile', async ({
  teacherPage,
}, testInfo) => {
  const { groupId } = fixtureData(testInfo.project.name).ids;
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const ar = locale === 'ar';
  const groupName = 'E2E mathematics group';

  await teacherPage.setViewportSize({ width: 1280, height: 900 });
  await teacherPage.goto(`/${locale}/teacher/groups`);
  const table = teacherPage.getByRole('table', { name: ar ? 'مجموعاتي' : 'My groups' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: ar ? 'المجموعة' : 'Group' })).toBeVisible();
  await expect(table.getByRole('link', { name: groupName, exact: true })).toHaveAttribute(
    'href',
    `/${locale}/teacher/groups/${groupId}`,
  );
  await expect(
    table.getByRole('link', { name: ar ? 'إدارة المجموعة ←' : 'Manage group →' }),
  ).toBeVisible();
  await expect(
    table.getByRole('button', { name: ar ? 'إلغاء / أرشفة المجموعة' : 'Cancel / archive group' }),
  ).toBeVisible();

  await teacherPage.setViewportSize({ width: 320, height: 844 });
  await expect(table).toBeHidden();
  const card = teacherPage.locator('article').filter({ hasText: groupName });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('link', { name: ar ? 'إدارة المجموعة ←' : 'Manage group →' }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: ar ? 'إلغاء / أرشفة المجموعة' : 'Cancel / archive group' }),
  ).toBeVisible();
  await expect
    .poll(() => teacherPage.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);
});
