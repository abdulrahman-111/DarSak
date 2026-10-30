import { test, expect, fixtureData } from './support/fixtures';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const tokens = new Map<string, Promise<string>>();

async function accessToken(
  page: import('@playwright/test').Page,
  actor: 'student' | 'outsider' | 'notificationStudent',
) {
  const key = `${test.info().project.name}:${actor}`;
  let token = tokens.get(key);
  if (!token) {
    token = requestAccessToken(page, actor);
    tokens.set(key, token);
  }
  return token;
}

async function requestAccessToken(
  page: import('@playwright/test').Page,
  actor: 'student' | 'outsider' | 'notificationStudent',
) {
  const { actors } = fixtureData(test.info().project.name);
  const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email: actors[actor].email, password: actors[actor].password },
  });
  expect(response.ok(), `local Auth password grant: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { access_token?: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token!;
}

async function restRows<T>(
  page: import('@playwright/test').Page,
  actor: 'student' | 'outsider',
  path: string,
) {
  const token = await accessToken(page, actor);
  const response = await page.request.get(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `${actor} REST request ${path}: ${response.status()}`).toBeTruthy();
  return (await response.json()) as T;
}

test('an outsider cannot see another student’s class, lesson, or private resource', async ({
  studentPage,
  outsiderPage,
}) => {
  const locale = test.info().project.name.startsWith('ar-') ? 'ar' : 'en';
  const { ids } = fixtureData(test.info().project.name);

  await outsiderPage.goto(`/${locale}/student/classes`);
  await expect(outsiderPage.getByText('E2E mathematics group', { exact: true })).toHaveCount(0);
  await outsiderPage.goto(`/${locale}/student/classes/${ids.groupId}`);
  await expect(outsiderPage.getByText('E2E mathematics group', { exact: true })).toHaveCount(0);
  await outsiderPage.goto(`/${locale}/student/lessons/${ids.futureLessonId}`);
  await expect(outsiderPage.getByText('E2E upcoming lesson', { exact: true })).toHaveCount(0);
  await expect(outsiderPage.getByText('E2E algebra resource', { exact: true })).toHaveCount(0);

  // These requests go straight to local PostgREST with each browser's real JWT and the local anon key.
  const groupFilter = `groups?select=id&id=eq.${ids.groupId}`;
  const lessonFilter = `lessons?select=id&id=eq.${ids.futureLessonId}`;
  const resourceFilter = `lesson_materials?select=id&lesson_id=eq.${ids.futureLessonId}&title=eq.E2E%20algebra%20resource`;
  expect(await restRows<unknown[]>(outsiderPage, 'outsider', groupFilter)).toEqual([]);
  expect(await restRows<unknown[]>(outsiderPage, 'outsider', lessonFilter)).toEqual([]);
  expect(await restRows<unknown[]>(outsiderPage, 'outsider', resourceFilter)).toEqual([]);

  await studentPage.goto(`/${locale}/student/classes/${ids.groupId}?view=lessons`);
  await expect(studentPage.getByText('E2E mathematics group', { exact: true })).toBeVisible();
  await expect(studentPage.getByText('E2E upcoming lesson', { exact: true })).toBeVisible();
  await studentPage.goto(`/${locale}/student/lessons/${ids.futureLessonId}`);
  await expect(studentPage.getByText('E2E algebra resource', { exact: true })).toBeVisible();
  expect(await restRows<unknown[]>(studentPage, 'student', groupFilter)).toHaveLength(1);
  expect(await restRows<unknown[]>(studentPage, 'student', lessonFilter)).toHaveLength(1);
  expect(await restRows<unknown[]>(studentPage, 'student', resourceFilter)).toHaveLength(1);

  // The security-definer RPC applies the same per-user scope: only the enrolled student sees the seeded notice.
  const notificationRpc = `${supabaseUrl}/rest/v1/rpc/notifications_page`;
  const rpc = async (
    page: typeof studentPage,
    actor: 'student' | 'outsider' | 'notificationStudent',
  ) => {
    const token = await accessToken(page, actor);
    const response = await page.request.post(notificationRpc, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { p_offset: 0, p_limit: 20 },
    });
    expect(response.ok(), `notifications_page RPC: ${response.status()}`).toBeTruthy();
    return response.json();
  };
  const outsiderNotifications = await rpc(outsiderPage, 'outsider');
  const notificationStudentNotifications = await rpc(studentPage, 'notificationStudent');
  expect(JSON.stringify(outsiderNotifications)).not.toContain(ids.notificationId);
  expect(JSON.stringify(notificationStudentNotifications)).toContain(ids.notificationId);
});
