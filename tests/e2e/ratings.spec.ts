import { test, expect, fixtureData } from './support/fixtures';
import { moderateRatingsFeedback, ratingsFixtureState } from './support/local-db';

function localeFor(project: string) {
  return project.startsWith('ar-') ? 'ar' : 'en';
}

async function profileRating(page: import('@playwright/test').Page, locale: string) {
  const visible = page
    .getByRole('group')
    .filter({ has: page.getByText(locale === 'ar' ? 'تقييم المعلم' : 'Teacher rating') });
  await expect(visible).toBeVisible();
  const json = (await page
    .locator('script[type="application/ld+json"]')
    .evaluate(el => JSON.parse(el.textContent ?? '{}'))) as Record<string, unknown>;
  const graph = Array.isArray(json['@graph']) ? (json['@graph'] as Record<string, unknown>[]) : [];
  const service = graph.find(item => item['@type'] === 'Service');
  expect(service).toBeTruthy();
  const person = graph.find(item => item['@type'] === 'Person');
  expect((service?.provider as Record<string, unknown>)?.['@id']).toBe(person?.['@id']);
  return { visible, aggregate: service?.aggregateRating as Record<string, unknown> };
}

test('ratings, prompt dismissal, moderation, discovery freshness, and Service schema work end to end', async ({
  ratingsTeacherPage,
  ratingsStudentPage,
}) => {
  test.setTimeout(180_000);
  const project = test.info().project.name;
  const locale = localeFor(project);
  const { actors, ids } = fixtureData(project);
  const discovery = ratingsStudentPage;
  const requests: string[] = [];
  discovery.on('request', request => {
    if (/\/rpc\/.*rating/i.test(request.url())) requests.push(request.url());
  });

  // The baseline group has a real visible 5.0 / 3 summary.
  await discovery.goto(`/${locale}/teachers`);
  const groupCard = discovery
    .getByRole('article')
    .filter({ hasText: 'E2E Ratings Algebra Group' })
    .first();
  await expect(groupCard).toBeVisible();
  await expect(groupCard.getByText(locale === 'ar' ? /٥٫٠/ : /5\.0\s*\/\s*5/)).toBeVisible();
  await expect(
    groupCard.getByText(locale === 'ar' ? 'عدد التقييمات: ٣' : 'Rating count: 3'),
  ).toBeVisible();
  await discovery.getByLabel(locale === 'ar' ? 'ترتيب حسب' : 'Sort by').selectOption('rating');
  await discovery
    .getByLabel(locale === 'ar' ? 'الحد الأدنى لتقييم المعلم' : 'Minimum teacher rating')
    .selectOption('5');
  await discovery
    .getByRole('button', { name: locale === 'ar' ? 'عرض النتائج' : 'Show results' })
    .click();
  await expect(discovery).toHaveURL(/sort=rating/);
  await expect(
    discovery.getByRole('article').filter({ hasText: 'E2E Ratings Algebra Group' }),
  ).toBeVisible();
  await groupCard.getByRole('link', { name: /E2E Ratings Teacher/ }).click();
  const initialProfile = await profileRating(discovery, locale);
  expect(initialProfile.aggregate).toMatchObject({
    ratingValue: 5,
    reviewCount: 3,
    bestRating: 5,
    worstRating: 1,
  });
  expect(await initialProfile.visible.getAttribute('aria-label')).toMatch(
    locale === 'ar' ? /٥.*٣/ : /5\.0.*3/,
  );
  expect(requests).toEqual([]);

  // Record the second ended lesson through the normal teacher attendance form.
  await ratingsTeacherPage.goto(`/${locale}/teacher/lessons/${ids.ratingsSecondLessonId}`);
  const attendance = ratingsTeacherPage.getByLabel(
    locale === 'ar' ? 'حضور E2E Ratings Student' : 'Attendance for E2E Ratings Student',
  );
  const row = attendance.locator('xpath=ancestor::form[1]');
  await attendance.selectOption('present');
  await row.getByRole('button', { name: locale === 'ar' ? 'حفظ' : 'Save' }).click();
  await expect(row.getByRole('status')).toBeVisible();

  await discovery.goto(`/${locale}/notifications`);
  const prompt = discovery.getByRole('article').filter({
    hasText: locale === 'ar' ? 'يمكنك الآن مشاركة تقييمك' : 'You can now share feedback',
  });
  await expect(prompt).toHaveCount(1);
  await prompt.getByRole('link', { name: locale === 'ar' ? 'فتح' : 'Open' }).click();
  await expect(discovery).toHaveURL(
    new RegExp(`/${locale}/groups/${ids.ratingsGroupId}#feedback$`),
  );
  const commentLabel =
    locale === 'ar'
      ? 'تجربتك (٢٠–١٥٠٠ حرف؛ لا تضف بيانات شخصية)'
      : 'Your experience (20–1,500 characters; no personal information)';
  await expect(discovery.getByLabel(commentLabel)).toBeVisible();
  await discovery.goto(`/${locale}/notifications`);
  const promptAgain = discovery.getByRole('article').filter({
    hasText: locale === 'ar' ? 'يمكنك الآن مشاركة تقييمك' : 'You can now share feedback',
  });
  await promptAgain
    .getByRole('button', { name: locale === 'ar' ? 'إخفاء طلب التقييم' : 'Dismiss review request' })
    .click();
  await expect(promptAgain).toHaveCount(0);
  await ratingsTeacherPage.goto(`/${locale}/teacher/lessons/${ids.ratingsSecondLessonId}`);
  const repeatAttendance = ratingsTeacherPage.getByLabel(
    locale === 'ar' ? 'حضور E2E Ratings Student' : 'Attendance for E2E Ratings Student',
  );
  const repeatRow = repeatAttendance.locator('xpath=ancestor::form[1]');
  await repeatAttendance.selectOption('present');
  await repeatRow.getByRole('button', { name: locale === 'ar' ? 'حفظ' : 'Save' }).click();
  await discovery.goto(`/${locale}/notifications`);
  await expect(
    discovery.getByText(
      locale === 'ar' ? 'لا توجد إشعارات حتى الآن.' : 'You have no notifications yet.',
    ),
  ).toBeVisible();

  // Dismissal does not remove access to the real feedback form.
  await discovery.goto(`/${locale}/groups/${ids.ratingsGroupId}#feedback`);
  await discovery
    .getByLabel(locale === 'ar' ? 'التقييم من ٥' : 'Rating out of 5')
    .selectOption('1');
  await discovery
    .getByLabel(commentLabel)
    .fill('A detailed synthetic review for the ratings journey.');
  await discovery.getByRole('button', { name: locale === 'ar' ? 'حفظ' : 'Save' }).click();
  await expect(discovery.getByRole('status')).toContainText(locale === 'ar' ? 'تم الحفظ' : 'Saved');
  await ratingsTeacherPage.goto(`/${locale}/notifications`);
  await expect(
    ratingsTeacherPage.getByText(
      locale === 'ar'
        ? 'يوجد تقييم جديد بانتظار المراجعة.'
        : 'A new review is waiting for moderation.',
    ),
  ).toBeVisible();
  await expect(
    ratingsTeacherPage.getByText('A detailed synthetic review', { exact: false }),
  ).toHaveCount(0);
  await expect(ratingsTeacherPage.getByText('E2E Ratings Student', { exact: false })).toHaveCount(
    0,
  );
  const submitted = await ratingsFixtureState(project);
  expect(submitted.status).toBe('pending');
  expect(submitted.baseline_count).toBe(3);
  expect(submitted.pending_admin_notice).toBe(true);

  // Prime the unfiltered minute cache before the canonical admin moderation.
  await discovery.goto(`/${locale}/teachers`);
  const defaultCard = discovery
    .getByRole('article')
    .filter({ hasText: 'E2E Ratings Algebra Group' });
  await expect(defaultCard).toBeVisible();
  const minuteBoundary = Math.floor(Date.now() / 60_000 + 1) * 60_000;
  await moderateRatingsFeedback(project, 'approve', '', 'private approval note');
  await discovery.goto(`/${locale}/notifications`);
  await expect(
    discovery.getByText(
      locale === 'ar'
        ? 'تمت الموافقة على تقييمك ونشره.'
        : 'Your feedback was approved and published.',
    ),
  ).toBeVisible();
  const freshnessStarted = Date.now();
  const deadline = Math.min(65_000, Math.max(0, minuteBoundary - freshnessStarted) + 8_000);
  await expect(async () => {
    await discovery.goto(`/${locale}/teachers`);
    const freshCard = discovery
      .getByRole('article')
      .filter({ hasText: 'E2E Ratings Algebra Group' });
    await expect(freshCard.getByText(locale === 'ar' ? /٤٫٠/ : /4\.0\s*\/\s*5/)).toBeVisible();
    await expect(
      freshCard.getByText(locale === 'ar' ? 'عدد التقييمات: ٤' : 'Rating count: 4'),
    ).toBeVisible();
    expect(Date.now()).toBeGreaterThanOrEqual(minuteBoundary);
  }).toPass({ timeout: deadline, intervals: [1_500, 2_500, 4_000] });
  await discovery
    .getByLabel(locale === 'ar' ? 'الحد الأدنى لتقييم المعلم' : 'Minimum teacher rating')
    .selectOption('5');
  await discovery
    .getByRole('button', { name: locale === 'ar' ? 'عرض النتائج' : 'Show results' })
    .click();
  await expect(
    discovery.getByRole('article').filter({ hasText: 'E2E Ratings Algebra Group' }),
  ).toHaveCount(0);
  await discovery.goto(`/${locale}/teachers/${actors.ratingsTeacher.id}`);
  const approvedProfile = await profileRating(discovery, locale);
  expect(approvedProfile.aggregate).toMatchObject({ ratingValue: 4, reviewCount: 4 });

  await moderateRatingsFeedback(
    project,
    'hide',
    'Publication guidelines require more detail.',
    'PRIVATE_ADMIN_NOTE_SENTINEL',
  );
  await discovery.goto(`/${locale}/notifications`);
  const hiddenNotice = discovery.getByText(
    locale === 'ar' ? /تم إخفاء تقييمك/ : /Your feedback was hidden/,
  );
  await expect(hiddenNotice).toContainText('Publication guidelines require more detail.');
  await expect(hiddenNotice).not.toContainText('PRIVATE_ADMIN_NOTE_SENTINEL');
  await discovery.goto(`/${locale}/teachers/${actors.ratingsTeacher.id}`);
  const hiddenProfile = await profileRating(discovery, locale);
  expect(hiddenProfile.aggregate).toMatchObject({ ratingValue: 5, reviewCount: 3 });
  await expect(discovery.getByText(locale === 'ar' ? /٥٫٠/ : /5\.0\s*\/\s*5/)).toBeVisible();
  await expect(requests).toEqual([]);
});
