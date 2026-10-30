import { test, expect, fixtureData } from './support/fixtures';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

test('student navigates to a future timetable lesson and opens its private details', async ({
  studentPage,
}, testInfo) => {
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const ar = locale === 'ar';
  const { actors, ids } = fixtureData(testInfo.project.name);

  const login = await studentPage.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email: actors.student.email, password: actors.student.password },
  });
  expect(login.ok(), `local student Auth grant: ${login.status()}`).toBeTruthy();
  const session = (await login.json()) as { access_token?: string };
  expect(session.access_token).toBeTruthy();

  const lessonResponse = await studentPage.request.get(
    `${supabaseUrl}/rest/v1/lessons?id=eq.${ids.futureLessonId}&select=starts_at`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } },
  );
  expect(lessonResponse.ok(), `local lesson read: ${lessonResponse.status()}`).toBeTruthy();
  const lessons = (await lessonResponse.json()) as Array<{ starts_at: string }>;
  expect(lessons).toHaveLength(1);
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(lessons[0].starts_at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find(value => value.type === type)?.value;
  const lessonDate = `${part('year')}-${part('month')}-${part('day')}`;
  expect(lessonDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await studentPage.goto(`/${locale}/timetable`);
  const weekNavigation = studentPage.getByRole('navigation', {
    name: ar ? 'التنقل بين الأسابيع' : 'Week navigation',
  });
  const days = studentPage.getByRole('navigation', {
    name: ar ? 'أيام الأسبوع' : 'Days of the week',
  });
  const selectedDay = days.locator('a[aria-current="date"]');
  const selectedDayHref = await selectedDay.getAttribute('href');
  expect(selectedDayHref).toBeTruthy();
  const initialWeek = new URL(selectedDayHref!, studentPage.url()).searchParams.get('week');
  expect(initialWeek).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const nextWeekLink = weekNavigation.getByRole('link', { name: ar ? 'التالي' : 'Next' });
  const nextWeekHref = await nextWeekLink.getAttribute('href');
  expect(nextWeekHref).toBeTruthy();
  const expectedNextWeek = new URL(nextWeekHref!, studentPage.url()).searchParams.get('week');
  expect(expectedNextWeek).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await nextWeekLink.click();
  await expect(days.locator('a[aria-current="date"]')).toHaveAttribute(
    'href',
    new RegExp(`[?&]week=${expectedNextWeek}(?:&|$)`),
  );
  const nextSelectedDayHref = await days.locator('a[aria-current="date"]').getAttribute('href');
  expect(nextSelectedDayHref).toBeTruthy();
  const nextWeek = new URL(nextSelectedDayHref!, studentPage.url()).searchParams.get('week');
  expect(nextWeek).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(nextWeek).not.toBe(initialWeek);

  await days.locator(`a[href*="day=${lessonDate}"]`).click();

  const lessonTitle = studentPage.getByRole('heading', {
    name: 'E2E upcoming lesson',
    exact: true,
  });
  await expect(lessonTitle).toBeVisible();
  const lessonRow = lessonTitle.locator('xpath=ancestor::li[1]');
  await lessonRow
    .getByRole('link', { name: ar ? 'عرض تفاصيل الحصة' : 'Open lesson details' })
    .click();

  await expect(studentPage).toHaveURL(new RegExp(`/student/lessons/${ids.futureLessonId}$`));
  await expect(
    studentPage.getByRole('heading', { name: 'E2E upcoming lesson', level: 1 }),
  ).toBeVisible();
  await expect(
    studentPage.getByRole('heading', { name: ar ? 'ملاحظات الحصة' : 'Lesson notes' }),
  ).toBeVisible();
  await expect(studentPage.getByText('Synthetic future lesson', { exact: true })).toBeVisible();
  await expect(studentPage.getByText('E2E algebra resource', { exact: true })).toBeVisible();
});
