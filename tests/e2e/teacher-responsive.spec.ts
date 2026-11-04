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

  const scheduleRows = teacherPage.locator('#schedule ul').first();
  await expect(scheduleRows).toBeVisible();
  const rowWidths = await scheduleRows.evaluate(element => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(rowWidths.scrollWidth).toBeLessThanOrEqual(rowWidths.clientWidth);
  const existingRow = scheduleRows.locator('li').first();
  const edit = existingRow.getByRole('link', { name: ar ? /^تعديل:/ : /^Edit:/ });
  const remove = existingRow.getByRole('button', {
    name: ar ? /^حذف الموعد:/ : /^Remove time:/,
  });
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  for (const action of [edit, remove]) {
    const bounds = await action.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
  await edit.click();
  const existingEditor = teacherPage.getByRole('form', {
    name: ar ? 'تعديل موعد' : 'Editing time',
  });
  await expect(existingEditor).toBeVisible();
  await expect(existingEditor.getByLabel(ar ? 'وقت البداية' : 'Start time')).toBeVisible();
  const duplicateIds = await teacherPage.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
  await expect
    .poll(() => teacherPage.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);

  await teacherPage.getByRole('link', { name: ar ? /إضافة موعد/ : /Add time/ }).click();
  const newEditor = teacherPage.getByRole('form', {
    name: ar ? 'موعد أسبوعي جديد' : 'New weekly time',
  });
  await expect(newEditor).toBeVisible();
  const weekday = newEditor.getByLabel(ar ? 'اليوم' : 'Weekday');
  const start = newEditor.getByLabel(ar ? 'وقت البداية' : 'Start time');
  const end = newEditor.getByLabel(ar ? 'وقت النهاية' : 'End time');
  const save = newEditor.getByRole('button', { name: ar ? 'حفظ الموعد' : 'Save time' });
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
  const fixtureRow = table.getByRole('row').filter({
    has: teacherPage.getByRole('link', { name: groupName, exact: true }),
  });
  await expect(
    fixtureRow.getByRole('link', { name: ar ? 'إدارة المجموعة ←' : 'Manage group →' }),
  ).toBeVisible();
  await expect(
    fixtureRow.getByRole('button', {
      name: ar ? 'إلغاء / أرشفة المجموعة' : 'Cancel / archive group',
    }),
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
