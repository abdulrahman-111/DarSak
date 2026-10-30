import { test, expect, fixtureData } from './support/fixtures';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function tokenFor(page: import('@playwright/test').Page) {
  const { actors } = fixtureData(test.info().project.name);
  const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: {
      email: actors.notificationStudent.email,
      password: actors.notificationStudent.password,
    },
  });
  expect(response.ok(), `local Auth password grant: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { access_token?: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token!;
}

test('opening a seeded notification marks it read and clears its badge after reload', async ({
  notificationPage,
}) => {
  const locale = test.info().project.name.startsWith('ar-') ? 'ar' : 'en';
  const { ids } = fixtureData(test.info().project.name);
  const token = await tokenFor(notificationPage);
  const request = async () => {
    const response = await notificationPage.request.get(
      `${supabaseUrl}/rest/v1/user_notifications?select=id,read_at&id=eq.${ids.notificationId}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
    );
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as { id: string; read_at: string | null }[];
  };

  await notificationPage.goto(`/${locale}/student`);
  await expect(notificationPage.getByTestId('bell-badge')).toHaveText('1');
  await notificationPage.goto(`/${locale}/notifications`);
  await expect(notificationPage.getByText(/E2E upcoming lesson/)).toBeVisible();
  await expect
    .poll(async () => (await request())[0]?.read_at ?? null, { timeout: 10_000 })
    .not.toBeNull();

  await notificationPage.reload();
  await expect(notificationPage.getByText(/E2E upcoming lesson/)).toBeVisible();
  await expect(
    notificationPage.getByRole('button', { name: /Mark read|تحديد كمقروء/ }),
  ).toHaveCount(0);
  await expect(notificationPage.getByTestId('bell-badge')).toHaveCount(0);
  expect((await request())[0]?.read_at).toBeTruthy();
});
