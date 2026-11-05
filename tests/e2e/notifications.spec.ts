import { test, expect, fixtureData } from './support/fixtures';
import { deleteLiveNotification, insertLiveNotification } from './support/local-db';
import { isPostgresChangesReadyFrame } from './support/realtime-readiness';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function tokenFor(
  page: import('@playwright/test').Page,
  actor: 'notificationStudent' | 'liveNotificationStudent' | 'student' = 'notificationStudent',
) {
  const { actors } = fixtureData(test.info().project.name);
  const response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: {
      email: actors[actor].email,
      password: actors[actor].password,
    },
  });
  expect(response.ok(), `local Auth password grant: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { access_token?: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token!;
}

function waitForRealtimeAck(page: import('@playwright/test').Page, userId: string) {
  let dispose = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for Realtime join acknowledgement.')),
      20_000,
    );
    const onWebSocket = (socket: import('@playwright/test').WebSocket) => {
      socket.on('framereceived', ({ payload }) => {
        if (!isPostgresChangesReadyFrame(String(payload), userId)) return;
        clearTimeout(timeout);
        page.off('websocket', onWebSocket);
        resolve();
      });
    };
    dispose = () => {
      clearTimeout(timeout);
      page.off('websocket', onWebSocket);
    };
    page.on('websocket', onWebSocket);
  });
  return { promise, dispose: () => dispose() };
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

test('a notification arrives in the open inbox, is marked read, and remains scoped to its recipient', async ({
  liveNotificationPage,
}) => {
  const project = test.info().project.name;
  const locale = project.startsWith('ar-') ? 'ar' : 'en';
  const { actors } = fixtureData(project);
  const ownerToken = await tokenFor(liveNotificationPage, 'liveNotificationStudent');
  const otherToken = await tokenFor(liveNotificationPage, 'student');
  const ack = waitForRealtimeAck(liveNotificationPage, actors.liveNotificationStudent.id);
  let viewerUnavailable = true;
  let insertedId: string | null = null;
  const rowFor = async (token: string, id: string) => {
    const response = await liveNotificationPage.request.get(
      `${supabaseUrl}/rest/v1/user_notifications?select=id,read_at&id=eq.${id}`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
    );
    expect(response.ok(), `local notification row request: ${response.status()}`).toBeTruthy();
    return (await response.json()) as { id: string; read_at: string | null }[];
  };
  try {
    await liveNotificationPage.route('**/api/viewer', route => {
      if (!viewerUnavailable) return route.continue();
      viewerUnavailable = false;
      return route.fulfill({ status: 503, body: 'unavailable' });
    });
    await liveNotificationPage.goto(`/${locale}/notifications`);
    await expect(
      liveNotificationPage.getByText(
        locale === 'ar' ? 'لا توجد إشعارات حتى الآن.' : 'You have no notifications yet.',
        { exact: true },
      ),
    ).toBeVisible();
    await ack.promise;

    insertedId = await insertLiveNotification(project);
    const title = `E2E live notification ${insertedId}`;
    await expect(liveNotificationPage.getByText(new RegExp(title), { exact: false })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      liveNotificationPage.getByText(
        locale === 'ar' ? /تم تغيير موعد حصة/ : /Lesson time changed:/,
      ),
    ).toBeVisible();
    await expect(liveNotificationPage).toHaveURL(new RegExp(`/${locale}/notifications$`));

    await expect
      .poll(async () => (await rowFor(ownerToken, insertedId!))[0]?.read_at ?? null, {
        timeout: 15_000,
      })
      .not.toBeNull();
    await expect(liveNotificationPage.getByTestId('bell-badge')).toHaveCount(0);

    const otherResponse = await liveNotificationPage.request.post(
      `${supabaseUrl}/rest/v1/rpc/notifications_page`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${otherToken}`,
          'Content-Type': 'application/json',
        },
        data: { p_offset: 0, p_limit: 20 },
      },
    );
    expect(otherResponse.ok()).toBeTruthy();
    expect(JSON.stringify(await otherResponse.json())).not.toContain(insertedId);

    await liveNotificationPage.unroute('**/api/viewer');
    await liveNotificationPage.reload();
    await expect(liveNotificationPage.getByText(new RegExp(title), { exact: false })).toBeVisible();
    await expect(
      liveNotificationPage.getByRole('button', { name: /Mark read|تحديد كمقروء/ }),
    ).toHaveCount(0);
    expect((await rowFor(ownerToken, insertedId))[0]?.read_at).toBeTruthy();
  } finally {
    ack.dispose();
    if (insertedId) await deleteLiveNotification(project, insertedId);
  }
});
