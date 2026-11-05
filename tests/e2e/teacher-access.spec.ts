import { randomUUID } from 'node:crypto';
import { expect, fixtureData, test } from './support/fixtures';
import {
  deleteAccessTeacherLessonIfPresent,
  hasAccessTeacherLesson,
  withExpiredLegacyAccess,
  withWithdrawnTeachingAccess,
} from './support/local-db';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function accessTeacherToken(page: import('@playwright/test').Page) {
  const { actors } = fixtureData(test.info().project.name);
  const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email: actors.accessTeacher.email, password: actors.accessTeacher.password },
  });
  expect(response.ok(), `local Auth password grant: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { access_token?: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token!;
}

async function teachingAccessStatus(page: import('@playwright/test').Page, token: string) {
  const response = await page.request.post(`${supabaseUrl}/rest/v1/rpc/teacher_access_status`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {},
  });
  expect(response.ok(), `teacher_access_status RPC: ${response.status()}`).toBeTruthy();
  return (await response.json()) as { has_access: boolean; expires_at: string | null };
}

function localeFor(projectName: string) {
  return projectName.startsWith('ar-') ? 'ar' : 'en';
}

function lessonForm(page: import('@playwright/test').Page, locale: string) {
  return page.getByLabel(locale === 'ar' ? 'عنوان الحصة' : 'Lesson title');
}

test('approved free-phase access remains available after only legacy access expires', async ({
  accessTeacherPage,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const { ids } = fixtureData(project);
  const token = await accessTeacherToken(accessTeacherPage);

  await withExpiredLegacyAccess(project, async () => {
    const status = await teachingAccessStatus(accessTeacherPage, token);
    expect(status.has_access).toBe(true);
    expect(status.expires_at).toBeNull();

    await accessTeacherPage.goto(
      `/${locale}/teacher/lessons?new=1&groupId=${ids.accessTeacherGroupId}`,
    );
    await expect(
      accessTeacherPage.getByRole('heading', {
        name: locale === 'ar' ? 'إضافة حصة' : 'Add lesson',
      }),
    ).toBeVisible();
    await expect(lessonForm(accessTeacherPage, locale)).toBeVisible();
  });

  expect((await teachingAccessStatus(accessTeacherPage, token)).has_access).toBe(true);
});

test('teaching access withdrawal blocks reads and a previously open lesson write', async ({
  accessTeacherPage,
}) => {
  const project = test.info().project.name;
  const locale = localeFor(project);
  const ar = locale === 'ar';
  const { ids } = fixtureData(project);
  const token = await accessTeacherToken(accessTeacherPage);
  const existingLessonTitle = 'E2E access fixture lesson';
  const attemptedTitle = `E2E withdrawn lesson ${randomUUID()}`;
  const formPage = await accessTeacherPage.context().newPage();
  const formUrl = `/${locale}/teacher/lessons?new=1&groupId=${ids.accessTeacherGroupId}`;
  let starts = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  starts.setUTCHours(10, 0, 0, 0);
  const startsAt = starts.toISOString().slice(0, 16);
  const endsAt = new Date(starts.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);

  try {
    await accessTeacherPage.goto(formUrl);
    await expect(lessonForm(accessTeacherPage, locale)).toBeVisible();
    await formPage.goto(formUrl);
    await expect(lessonForm(formPage, locale)).toBeVisible();

    await withWithdrawnTeachingAccess(project, async () => {
      expect((await teachingAccessStatus(accessTeacherPage, token)).has_access).toBe(false);

      await lessonForm(accessTeacherPage, locale).fill(attemptedTitle);
      await accessTeacherPage.getByLabel(ar ? 'البداية' : 'Starts').fill(startsAt);
      await accessTeacherPage.getByLabel(ar ? 'النهاية' : 'Ends').fill(endsAt);
      await accessTeacherPage
        .getByRole('button', { name: ar ? 'حفظ الحصة' : 'Save lesson' })
        .click();
      await expect(accessTeacherPage.getByRole('alert')).toHaveText(
        ar
          ? 'انتهت صلاحية التدريس. جدّد الوصول من صفحة صلاحية التدريس.'
          : 'Teaching access has expired. Renew access from the teaching access page.',
      );
      expect(await hasAccessTeacherLesson(project, attemptedTitle)).toBe(false);

      await formPage.goto(`/${locale}/teacher/lessons`);
      await expect(formPage).toHaveURL(new RegExp(`/${locale}/account/teaching-access(?:\\?|$)`));
      await expect(lessonForm(formPage, locale)).toHaveCount(0);
      await expect(formPage.getByRole('heading', { name: existingLessonTitle })).toHaveCount(0);

      await formPage.goto(formUrl);
      await expect(formPage).toHaveURL(new RegExp(`/${locale}/account/teaching-access(?:\\?|$)`));
      await expect(lessonForm(formPage, locale)).toHaveCount(0);
      await expect(formPage.getByRole('heading', { name: existingLessonTitle })).toHaveCount(0);

      await formPage.goto(`/${locale}/teacher/lessons/${ids.accessTeacherLessonId}`);
      await expect(formPage).toHaveURL(new RegExp(`/${locale}/account/teaching-access(?:\\?|$)`));
      await expect(lessonForm(formPage, locale)).toHaveCount(0);
      await expect(formPage.getByRole('heading', { name: existingLessonTitle })).toHaveCount(0);

      await formPage.goto(`/${locale}/account`);
      await expect(formPage).toHaveURL(new RegExp(`/${locale}/account$`));
      await expect(
        formPage.getByRole('heading', { name: ar ? 'إعدادات الحساب' : 'Account settings' }),
      ).toBeVisible();
      await formPage.goto(`/${locale}/account/teaching-access`);
      await expect(formPage).toHaveURL(new RegExp(`/${locale}/account/teaching-access$`));
      await expect(
        formPage.getByRole('heading', {
          name: ar ? 'الخطة والاستخدام' : 'Teaching plan and usage',
        }),
      ).toBeVisible();
    });
  } finally {
    await deleteAccessTeacherLessonIfPresent(project, attemptedTitle);
    await formPage.close();
  }

  expect((await teachingAccessStatus(accessTeacherPage, token)).has_access).toBe(true);
});
