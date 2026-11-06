import { test, expect, fixtureData, storageStatePath } from './support/fixtures';
import { meetingFixtureState, setMeetingFixtureTiming } from './support/local-db';

test.setTimeout(180_000);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function accessToken(
  page: import('@playwright/test').Page,
  project: string,
  actor: 'meetingTeacher' | 'meetingStudent' | 'outsider',
) {
  const credentials = fixtureData(project).actors[actor];
  const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.ok(), `local Auth password grant: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { access_token?: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token!;
}

async function meetingRpc(
  page: import('@playwright/test').Page,
  project: string,
  actor: 'meetingTeacher' | 'meetingStudent' | 'outsider',
  lessonId: string,
) {
  const token = await accessToken(page, project, actor);
  const response = await page.request.post(`${supabaseUrl}/rest/v1/rpc/meeting_links`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { p_lesson_ids: [lessonId] },
  });
  expect(response.ok(), `meeting_links RPC: ${response.status()}`).toBeTruthy();
  return response.json() as Promise<Array<{ lesson_id: string; meeting_url: string | null }>>;
}

async function assertMeetingLink(
  page: import('@playwright/test').Page,
  meetingUrl: string,
  locale: 'en' | 'ar',
) {
  const link = page.locator(`a[href="${meetingUrl}"]`);
  await expect(link).toHaveCount(1);
  await expect(link).toBeVisible();
  await expect(link.getByText(new URL(meetingUrl).hostname, { exact: false })).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  const rel = (await link.getAttribute('rel'))?.split(/\s+/) ?? [];
  expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  await expect(link).toContainText(locale === 'ar' ? 'انضم إلى الاجتماع' : 'Join meeting');
}

async function assertNoMeetingLink(page: import('@playwright/test').Page, meetingUrls: string[]) {
  for (const url of meetingUrls) await expect(page.locator(`a[href="${url}"]`)).toHaveCount(0);
}

async function assertViewport(page: import('@playwright/test').Page, project: string) {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    direction: document.documentElement.dir,
  }));
  if (project.endsWith('mobile'))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  if (project.startsWith('ar-')) expect(dimensions.direction).toBe('rtl');
}

async function saveGroupLink(
  page: import('@playwright/test').Page,
  locale: 'en' | 'ar',
  url: string,
) {
  const form = page
    .getByLabel(locale === 'ar' ? 'رابط الاجتماع الافتراضي' : 'Default meeting link')
    .locator('xpath=ancestor::form[1]');
  await form
    .getByLabel(locale === 'ar' ? 'رابط الاجتماع الافتراضي' : 'Default meeting link')
    .fill(url);
  await form.getByRole('button', { name: locale === 'ar' ? 'حفظ الرابط' : 'Save link' }).click();
  await expect(form.getByRole('status')).toHaveText(
    locale === 'ar' ? 'تم حفظ رابط الاجتماع.' : 'Meeting link saved.',
  );
}

async function lessonEditForm(page: import('@playwright/test').Page, locale: 'en' | 'ar') {
  const title = page.getByLabel(locale === 'ar' ? 'عنوان الحصة' : 'Lesson title');
  const form = title.locator('xpath=ancestor::form[1]');
  await expect(form).toBeVisible();
  return form;
}

function cairoDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

test('an accepted student and lesson owner use the private meeting link across the meeting lifecycle', async ({
  browser,
  meetingTeacherPage,
  meetingStudentPage,
  outsiderPage,
}, testInfo) => {
  const project = testInfo.project.name;
  const locale: 'en' | 'ar' = project.startsWith('ar-') ? 'ar' : 'en';
  const ar = locale === 'ar';
  const mobile = project.endsWith('mobile');
  const fixture = fixtureData(project);
  const { ids } = fixture;
  const baseURL = process.env.E2E_BASE_URL ?? (testInfo.project.use.baseURL as string);
  const { meetingGroupId: groupId, meetingLessonId: lessonId } = ids;
  const initialUrl = 'https://meet.google.com/abc-defg-hij';
  const overrideUrl = `https://meet.jit.si/darsak-e2e-${project}`;
  const replacementUrl = 'https://meet.google.com/jkl-mnopq-rst';
  const allUrls = [initialUrl, overrideUrl, replacementUrl];
  const groupPath = `/${locale}/teacher/groups/${groupId}`;
  const lessonPath = `/${locale}/teacher/lessons/${lessonId}`;
  const studentLessonPath = `/${locale}/student/lessons/${lessonId}`;

  // The reserved fixture is one accepted enrollment and one scheduled lesson with no stored URL.
  let state = await meetingFixtureState(project);
  expect(state.manual_url).toBeNull();
  expect(state.group_url).toBeNull();
  expect(state.lesson_count).toBe(1);

  // The teacher saves the real group default through the owner form.
  await meetingTeacherPage.goto(groupPath);
  await saveGroupLink(meetingTeacherPage, locale, initialUrl);
  await meetingTeacherPage.reload();
  await expect(
    meetingTeacherPage.getByLabel(ar ? 'رابط الاجتماع الافتراضي' : 'Default meeting link'),
  ).toHaveValue(initialUrl);
  state = await meetingFixtureState(project);
  expect(state.group_url).toBe(initialUrl);
  expect(state.manual_url).toBeNull();

  // Check all four rendered surfaces while the lesson is inside its join window.
  await setMeetingFixtureTiming(project, 'active');
  await meetingStudentPage.goto(`/${locale}/student`);
  await assertMeetingLink(meetingStudentPage, initialUrl, locale);
  await assertViewport(meetingStudentPage, project);
  await meetingStudentPage.goto(`/${locale}/student/classes/${groupId}`);
  await assertMeetingLink(meetingStudentPage, initialUrl, locale);
  await assertViewport(meetingStudentPage, project);
  await meetingStudentPage.goto(studentLessonPath);
  await assertMeetingLink(meetingStudentPage, initialUrl, locale);
  await assertViewport(meetingStudentPage, project);
  await meetingTeacherPage.goto(lessonPath);
  await assertMeetingLink(meetingTeacherPage, initialUrl, locale);
  await assertViewport(meetingTeacherPage, project);

  // A title-only edit keeps the blank override, so the default continues to be inherited.
  const lessonForm = await lessonEditForm(meetingTeacherPage, locale);
  const meetingInput = lessonForm.getByLabel(
    ar ? 'رابط اجتماع خاص بهذه الحصة' : 'Lesson meeting link',
  );
  await expect(meetingInput).toHaveValue('');
  await lessonForm
    .getByLabel(ar ? 'عنوان الحصة' : 'Lesson title')
    .fill('E2E meeting links lesson edited');
  await lessonForm.getByRole('button', { name: ar ? 'حفظ الحصة' : 'Save lesson' }).click();
  await expect(lessonForm.getByRole('status')).toHaveText(ar ? 'تم الحفظ.' : 'Saved.');
  await meetingTeacherPage.reload();
  const reloadedLessonForm = await lessonEditForm(meetingTeacherPage, locale);
  await expect(
    reloadedLessonForm.getByLabel(ar ? 'رابط اجتماع خاص بهذه الحصة' : 'Lesson meeting link'),
  ).toHaveValue('');
  state = await meetingFixtureState(project);
  expect(state.manual_url).toBeNull();

  // Setting a lesson override changes the student link; clearing it restores inheritance.
  await reloadedLessonForm
    .getByLabel(ar ? 'رابط اجتماع خاص بهذه الحصة' : 'Lesson meeting link')
    .fill(overrideUrl);
  await reloadedLessonForm.getByRole('button', { name: ar ? 'حفظ الحصة' : 'Save lesson' }).click();
  await expect(reloadedLessonForm.getByRole('status')).toHaveText(ar ? 'تم الحفظ.' : 'Saved.');
  state = await meetingFixtureState(project);
  expect(state.manual_url).toBe(overrideUrl);
  await meetingStudentPage.goto(studentLessonPath);
  await assertMeetingLink(meetingStudentPage, overrideUrl, locale);
  await assertNoMeetingLink(meetingStudentPage, [initialUrl]);

  const overrideForm = await lessonEditForm(meetingTeacherPage, locale);
  await overrideForm.getByLabel(ar ? 'رابط اجتماع خاص بهذه الحصة' : 'Lesson meeting link').fill('');
  await overrideForm.getByRole('button', { name: ar ? 'حفظ الحصة' : 'Save lesson' }).click();
  await expect(overrideForm.getByRole('status')).toHaveText(ar ? 'تم الحفظ.' : 'Saved.');
  state = await meetingFixtureState(project);
  expect(state.manual_url).toBeNull();
  await meetingStudentPage.goto(studentLessonPath);
  await assertMeetingLink(meetingStudentPage, initialUrl, locale);

  await meetingTeacherPage.goto(groupPath);
  await saveGroupLink(meetingTeacherPage, locale, replacementUrl);
  state = await meetingFixtureState(project);
  expect(state.group_url).toBe(replacementUrl);
  expect(state.lesson_count).toBe(1);
  expect(state.manual_url).toBeNull();
  expect(state.lesson_count).toBe(1);
  await meetingStudentPage.goto(studentLessonPath);
  await assertMeetingLink(meetingStudentPage, replacementUrl, locale);

  // Unsupported but browser-valid HTTPS URLs show action feedback and leave stored values intact.
  const groupForm = meetingTeacherPage
    .getByLabel(ar ? 'رابط الاجتماع الافتراضي' : 'Default meeting link')
    .locator('xpath=ancestor::form[1]');
  await groupForm
    .getByLabel(ar ? 'رابط الاجتماع الافتراضي' : 'Default meeting link')
    .fill('https://example.invalid/room');
  await groupForm.getByRole('button', { name: ar ? 'حفظ الرابط' : 'Save link' }).click();
  await expect(groupForm.getByRole('alert')).toHaveText(
    ar
      ? 'أدخل رابط HTTPS صالحاً من مزود اجتماعات مدعوم.'
      : 'Enter a valid HTTPS link from a supported meeting provider.',
  );
  state = await meetingFixtureState(project);
  expect(state.group_url).toBe(replacementUrl);

  await meetingTeacherPage.goto(lessonPath);
  const invalidLessonForm = await lessonEditForm(meetingTeacherPage, locale);
  await invalidLessonForm
    .getByLabel(ar ? 'رابط اجتماع خاص بهذه الحصة' : 'Lesson meeting link')
    .fill('https://example.invalid/room');
  await invalidLessonForm.getByRole('button', { name: ar ? 'حفظ الحصة' : 'Save lesson' }).click();
  await expect(invalidLessonForm.getByRole('alert')).toHaveText(
    ar
      ? 'أدخل رابط HTTPS صالحاً من مزود اجتماعات مدعوم أو اتركه فارغاً.'
      : 'Enter a valid HTTPS link from a supported meeting provider, or leave it empty.',
  );
  state = await meetingFixtureState(project);
  expect(state.group_url).toBe(replacementUrl);
  expect(state.manual_url).toBeNull();
  expect(state.lesson_count).toBe(1);

  // Student calendar download includes the private URL and remains private to that session.
  const from = cairoDate(state.starts_at);
  const until = cairoDate(state.ends_at);
  const studentCalendar = await meetingStudentPage.request.get(
    new URL(`/api/calendar?from=${from}&until=${until}&locale=${locale}`, baseURL).toString(),
  );
  expect(studentCalendar.ok()).toBeTruthy();
  expect(studentCalendar.headers()['content-type']).toContain('text/calendar');
  expect(studentCalendar.headers()['content-disposition']).toContain('attachment');
  expect(studentCalendar.headers()['cache-control']).toContain('private');
  expect(studentCalendar.headers()['cache-control']).toContain('no-store');
  const calendarText = (await studentCalendar.text()).replace(/\r\n /g, '');
  expect(calendarText).toContain('LOCATION:');
  expect(calendarText).toContain(replacementUrl);
  expect(calendarText).toContain('E2E meeting links lesson edited');

  // Real Auth JWTs exercise the scoped RPC and public table projection for all three roles.
  const teacherLinks = await meetingRpc(meetingTeacherPage, project, 'meetingTeacher', lessonId);
  const studentLinks = await meetingRpc(meetingStudentPage, project, 'meetingStudent', lessonId);
  const outsiderLinks = await meetingRpc(outsiderPage, project, 'outsider', lessonId);
  expect(teacherLinks).toEqual([{ lesson_id: lessonId, meeting_url: replacementUrl }]);
  expect(studentLinks).toEqual([{ lesson_id: lessonId, meeting_url: replacementUrl }]);
  expect(outsiderLinks).toEqual([]);

  const outsiderToken = await accessToken(outsiderPage, project, 'outsider');
  const publicGroups = await outsiderPage.request.get(
    `${supabaseUrl}/rest/v1/groups?id=eq.${groupId}&select=*`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${outsiderToken}` } },
  );
  expect(publicGroups.ok()).toBeTruthy();
  const publicGroupJson = JSON.stringify(await publicGroups.json());
  for (const url of allUrls) expect(publicGroupJson).not.toContain(url);

  await outsiderPage.goto(`/${locale}/student/classes/${groupId}`);
  await assertNoMeetingLink(outsiderPage, allUrls);
  await expect(outsiderPage.getByText('E2E meeting links group', { exact: true })).toHaveCount(0);
  await outsiderPage.goto(studentLessonPath);
  await assertNoMeetingLink(outsiderPage, allUrls);
  await expect(
    outsiderPage.getByText('E2E meeting links lesson edited', { exact: true }),
  ).toHaveCount(0);
  const outsiderCalendar = await outsiderPage.request.get(
    new URL(`/api/calendar?from=${from}&until=${until}&locale=${locale}`, baseURL).toString(),
  );
  expect(outsiderCalendar.ok()).toBeTruthy();
  const outsiderCalendarText = await outsiderCalendar.text();
  expect(outsiderCalendarText).not.toContain(lessonId);
  for (const url of allUrls) expect(outsiderCalendarText).not.toContain(url);

  const publicContext = await browser.newContext({
    baseURL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: ar ? 'ar-EG' : 'en-US',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  try {
    const publicPage = await publicContext.newPage();
    const publicResponse = await publicPage.goto(`/${locale}/classes/${groupId}`);
    expect(publicResponse?.status()).toBe(200);
    await expect(
      publicPage.getByRole('heading', { name: 'E2E meeting links group', level: 1 }),
    ).toBeVisible();
    await assertNoMeetingLink(publicPage, allUrls);
    const publicPageText = (await publicPage.locator('body').innerText()).toLowerCase();
    for (const url of allUrls) expect(publicPageText).not.toContain(url.toLowerCase());
  } finally {
    await publicContext.close();
  }

  // Reloaded routes reflect all timing states without changing server time.
  await setMeetingFixtureTiming(project, 'before');
  await meetingStudentPage.goto(studentLessonPath);
  await assertNoMeetingLink(meetingStudentPage, allUrls);
  await expect(
    meetingStudentPage.getByText(ar ? /يفتح رابط الاجتماع/ : /meeting link opens/i),
  ).toBeVisible();
  await setMeetingFixtureTiming(project, 'active');
  await meetingStudentPage.reload();
  await assertMeetingLink(meetingStudentPage, replacementUrl, locale);
  await setMeetingFixtureTiming(project, 'ended');
  await meetingStudentPage.reload();
  await assertNoMeetingLink(meetingStudentPage, allUrls);

  // A page-only clock checks the exact open threshold and Cairo midnight; Auth and DB time stay real.
  state = await setMeetingFixtureTiming(project, 'midnight');
  const clockContext = await browser.newContext({
    baseURL,
    storageState: storageStatePath(project, 'meetingStudent'),
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: ar ? 'ar-EG' : 'en-US',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  try {
    const clockPage = await clockContext.newPage();
    const startsAt = new Date(state.starts_at).getTime();
    const endsAt = new Date(state.ends_at).getTime();
    const justBeforeOpen = new Date(startsAt - 15 * 60_000 - 1_000);
    await clockPage.clock.install({ time: justBeforeOpen });
    await clockPage.clock.pauseAt(justBeforeOpen);
    await clockPage.goto(studentLessonPath);
    await assertNoMeetingLink(clockPage, allUrls);
    await clockPage.clock.fastForward(1_000);
    await assertMeetingLink(clockPage, replacementUrl, locale);
    const midnight = startsAt + 5 * 60_000;
    await clockPage.clock.fastForward(midnight - (startsAt - 15 * 60_000));
    await assertMeetingLink(clockPage, replacementUrl, locale);
    await clockPage.clock.fastForward(endsAt - midnight);
    await assertNoMeetingLink(clockPage, allUrls);
  } finally {
    await clockContext.close();
  }
});
