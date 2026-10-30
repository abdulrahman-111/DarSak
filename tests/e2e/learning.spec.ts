import { test, expect } from './support/fixtures';
import { fixtureData } from './support/data';

test.setTimeout(120_000);

test('teacher publishes a class, accepts an enrollment request, and unlocks the private class', async ({
  teacherPage,
  studentPage,
}, testInfo) => {
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const ar = locale === 'ar';
  const fixture = fixtureData(testInfo.project.name);
  const groupName = `E2E class ${testInfo.project.name} ${Date.now()}`;

  await teacherPage.goto(`/${locale}/teacher/groups/new`);
  await teacherPage.getByLabel(ar ? 'اسم المجموعة' : 'Group name').fill(groupName);
  await teacherPage
    .getByLabel(ar ? 'الوصف' : 'Description')
    .fill('A class created through the browser learning workflow.');
  const subject = teacherPage.getByLabel(ar ? 'المادة' : 'Subject');
  await expect(subject.locator('option').nth(1)).toBeAttached();
  await subject.selectOption({ index: 1 });
  const category = teacherPage.getByLabel(ar ? 'السنة / فئة الطلاب' : 'Year / student category');
  await expect(category.locator('option').nth(1)).toBeAttached();
  await category.selectOption({ index: 1 });
  await teacherPage.getByLabel(ar ? 'السعة' : 'Capacity').fill('8');
  await teacherPage.getByLabel(ar ? 'المكان' : 'Location').fill('Online');
  await teacherPage
    .getByLabel(ar ? 'ما الذي سيتعلمه الطلاب؟' : 'What will students learn?')
    .fill('Solve linear equations and explain each step.');
  await teacherPage
    .getByLabel(ar ? 'ما المعرفة المطلوبة للانضمام؟' : 'What should students know before joining?')
    .fill('Comfort with basic arithmetic.');

  await Promise.all([
    teacherPage.waitForURL(/\/teacher\/groups\/[^/]+\/setup\?step=schedule$/),
    teacherPage
      .getByRole('button', {
        name: ar ? 'حفظ والمتابعة إلى الجدول' : 'Save and continue to schedule',
      })
      .click(),
  ]);
  const groupId = new URL(teacherPage.url()).pathname.split('/')[4];
  expect(groupId).toBeTruthy();
  await expect(teacherPage.getByRole('heading', { name: groupName, level: 1 })).toBeVisible();
  await teacherPage.getByLabel(ar ? 'وقت البداية' : 'Start time').fill('10:00');
  await teacherPage.getByLabel(ar ? 'وقت النهاية' : 'End time').fill('11:00');
  await teacherPage
    .getByRole('button', { name: ar ? 'إضافة موعد أسبوعي' : 'Add weekly time' })
    .click();
  await expect(
    teacherPage.getByText(ar ? 'تم حفظ الموعد الأسبوعي.' : 'Weekly time saved.', { exact: true }),
  ).toBeVisible();
  await teacherPage.reload();
  await expect(teacherPage.locator('input[name="start_time"]').first()).toHaveValue('10:00');
  await teacherPage
    .getByRole('link', { name: ar ? 'متابعة إلى المراجعة' : 'Continue to review' })
    .click();
  await expect(teacherPage).toHaveURL(
    new RegExp(`/teacher/groups/${groupId}/setup\\?step=review$`),
  );
  await expect(teacherPage.getByRole('heading', { name: groupName, level: 1 })).toBeVisible();
  await expect(
    teacherPage.getByRole('heading', { name: ar ? 'المواعيد الأسبوعية' : 'Weekly schedule' }),
  ).toBeVisible();
  await teacherPage.getByRole('button', { name: ar ? 'نشر المجموعة' : 'Publish group' }).click();
  await expect(teacherPage).toHaveURL(new RegExp(`/teacher/groups/${groupId}(?:$|\\?)`));
  await expect(teacherPage.getByRole('heading', { name: groupName, level: 1 })).toBeVisible();

  await studentPage.goto(`/${locale}/groups/${groupId}`);
  await expect(studentPage.getByRole('heading', { name: groupName, level: 1 })).toBeVisible();
  await studentPage.locator('[data-request-action]').click();
  await expect(studentPage.locator('.student-request-confirmation')).toContainText(
    ar ? 'تم إرسال طلبك! سيراجعه معلمك.' : 'Request sent! Your teacher will review it.',
  );

  await teacherPage.goto(`/${locale}/teacher/groups/${groupId}`);
  await expect(teacherPage.getByText('E2E Student', { exact: true })).toBeVisible();
  await teacherPage.getByRole('button', { name: ar ? 'قبول' : 'Accept' }).click();
  await teacherPage.reload();
  const studentRosterRow = teacherPage.getByText('E2E Student', { exact: true }).locator('..');
  await expect(studentRosterRow).toContainText(ar ? 'مقبول' : 'Accepted');

  await studentPage.goto(`/${locale}/student/classes/${groupId}`);
  await expect(studentPage.getByRole('heading', { name: groupName, level: 1 })).toBeVisible();
  await studentPage.reload();
  await expect(studentPage.getByRole('heading', { name: groupName, level: 1 })).toBeVisible();
  expect(groupId).not.toBe(fixture.ids.groupId);
});

test('accepted student opens class resources, submits an assignment, and can give feedback after attendance', async ({
  teacherPage,
  studentPage,
}, testInfo) => {
  const locale = testInfo.project.name.startsWith('ar-') ? 'ar' : 'en';
  const ar = locale === 'ar';
  const fixture = fixtureData(testInfo.project.name);
  const { groupId, futureLessonId, endedLessonId } = fixture.ids;
  const resourceTitle = `E2E resource ${testInfo.project.name}`;
  const resourceUrl = 'https://example.com/e2e-learning-resource';
  const assignmentTitle = `E2E assignment ${testInfo.project.name}`;
  const submissionUrl = 'https://example.com/e2e-student-work';
  const teacherFeedback = `E2E private feedback ${testInfo.project.name}`;
  const feedbackComment = `E2E feedback for the completed class in ${testInfo.project.name}.`;

  await teacherPage.goto(`/${locale}/teacher/lessons/${futureLessonId}`);
  const addLinkForm = teacherPage
    .getByRole('heading', { name: ar ? 'إضافة رابط' : 'Add link' })
    .locator('..');
  await addLinkForm.locator('input[name="title"]').fill(resourceTitle);
  await addLinkForm.locator('input[name="url"]').fill(resourceUrl);
  await addLinkForm.getByRole('button', { name: ar ? 'إضافة الرابط' : 'Add link' }).click();
  await expect(
    addLinkForm.getByText(ar ? 'تمت إضافة المادة.' : 'Material added.', { exact: true }),
  ).toBeVisible();
  await teacherPage.reload();
  await expect(teacherPage.getByText(resourceTitle, { exact: true })).toBeVisible();

  await teacherPage.goto(`/${locale}/teacher/groups/${groupId}/assignments`);
  await teacherPage.getByLabel(ar ? 'عنوان الواجب' : 'Title').fill(assignmentTitle);
  await teacherPage
    .getByLabel(ar ? 'التعليمات' : 'Instructions')
    .fill('Complete the short practice and share a link to your work.');
  await teacherPage
    .getByLabel(ar ? 'رابط مورد (اختياري)' : 'Resource link (optional)')
    .fill('https://example.com/e2e-assignment-resource');
  await teacherPage.getByRole('button', { name: ar ? 'نشر الواجب' : 'Publish assignment' }).click();
  const teacherAssignment = teacherPage.getByRole('heading', {
    name: assignmentTitle,
    exact: true,
  });
  await expect(teacherAssignment).toBeVisible();
  await teacherPage.reload();
  await expect(
    teacherPage.getByRole('heading', { name: assignmentTitle, exact: true }),
  ).toBeVisible();

  await studentPage.goto(`/${locale}/student/classes/${groupId}?view=materials`);
  await expect(
    studentPage.getByRole('heading', { name: resourceTitle, exact: true }),
  ).toBeVisible();
  const resourceCard = studentPage
    .getByRole('heading', { name: resourceTitle, exact: true })
    .locator('xpath=ancestor::article[1]');
  const openResource = resourceCard.getByRole('link', {
    name: ar ? 'فتح المورد' : 'Open resource',
  });
  await expect(openResource).toHaveAttribute('href', resourceUrl);
  const [resourcePopup] = await Promise.all([
    studentPage.waitForEvent('popup'),
    openResource.click(),
  ]);
  // The href and popup event verify the resource opens; the E2E runner may have
  // no outbound network, so do not make the remote site's availability a requirement.
  await resourcePopup.close();

  await studentPage.goto(`/${locale}/student/classes/${groupId}?view=assignments`);
  const studentAssignmentHeading = studentPage.getByRole('heading', {
    name: assignmentTitle,
    exact: true,
  });
  await expect(studentAssignmentHeading).toBeVisible();
  const assignmentCard = studentAssignmentHeading.locator('xpath=ancestor::article[1]');
  await assignmentCard.getByLabel(ar ? 'رابط التسليم' : 'Submission link').fill(submissionUrl);
  await assignmentCard
    .getByLabel(ar ? 'ملاحظة للمعلم (اختيارية)' : 'Note for your teacher (optional)')
    .fill('Here is my completed work.');
  await assignmentCard.getByRole('button', { name: ar ? 'إرسال الرابط' : 'Submit link' }).click();
  await expect(assignmentCard.getByRole('link', { name: submissionUrl })).toBeVisible();
  await expect(
    assignmentCard.getByLabel(ar ? 'ملاحظة للمعلم (اختيارية)' : 'Note for your teacher (optional)'),
  ).toHaveValue('Here is my completed work.');
  await studentPage.reload();
  await expect(assignmentCard.getByRole('link', { name: submissionUrl })).toBeVisible();
  await expect(
    assignmentCard.getByLabel(ar ? 'ملاحظة للمعلم (اختيارية)' : 'Note for your teacher (optional)'),
  ).toHaveValue('Here is my completed work.');

  await teacherPage.goto(`/${locale}/teacher/groups/${groupId}/assignments`);
  const teacherAssignmentCard = teacherPage
    .getByRole('heading', { name: assignmentTitle, exact: true })
    .locator('xpath=ancestor::article[1]');
  await teacherAssignmentCard
    .getByRole('link', { name: ar ? 'مراجعة التسليمات' : 'Review submissions' })
    .click();
  await expect(teacherPage).toHaveURL(new RegExp(`/teacher/groups/${groupId}/assignments/[^/]+$`));
  await expect(teacherPage.getByRole('link', { name: submissionUrl })).toBeVisible();
  const teacherFeedbackForm = teacherPage
    .getByLabel(ar ? 'ملاحظات خاصة للطالب' : 'Private feedback for student')
    .locator('xpath=ancestor::form[1]');
  await teacherFeedbackForm
    .getByLabel(ar ? 'ملاحظات خاصة للطالب' : 'Private feedback for student')
    .fill(teacherFeedback);
  await teacherFeedbackForm
    .getByRole('button', { name: ar ? 'حفظ الملاحظات' : 'Save feedback' })
    .click();
  await expect(teacherFeedbackForm.getByRole('status')).toHaveText(
    ar ? 'تم حفظ التعليق.' : 'Feedback saved.',
  );
  await expect(
    teacherFeedbackForm.getByLabel(ar ? 'ملاحظات خاصة للطالب' : 'Private feedback for student'),
  ).toHaveValue(teacherFeedback);
  await teacherPage.reload();
  await expect(
    teacherPage
      .getByLabel(ar ? 'ملاحظات خاصة للطالب' : 'Private feedback for student')
      .locator('xpath=ancestor::form[1]')
      .getByLabel(ar ? 'ملاحظات خاصة للطالب' : 'Private feedback for student'),
  ).toHaveValue(teacherFeedback);

  await teacherPage.goto(`/${locale}/teacher/lessons/${endedLessonId}`);
  const attendanceRow = teacherPage
    .getByLabel(ar ? 'حضور E2E Student' : 'Attendance for E2E Student')
    .locator('..')
    .locator('..');
  await teacherPage
    .getByLabel(ar ? 'حضور E2E Student' : 'Attendance for E2E Student')
    .selectOption('present');
  await attendanceRow.getByRole('button', { name: ar ? 'حفظ' : 'Save' }).click();
  await expect(
    attendanceRow.getByRole('paragraph').filter({ hasText: ar ? /^حاضر$/ : /^Present$/ }),
  ).toBeVisible();
  await teacherPage.reload();
  await expect(
    teacherPage.getByLabel(ar ? 'حضور E2E Student' : 'Attendance for E2E Student'),
  ).toHaveValue('present');

  await studentPage.goto(`/${locale}/student/classes/${groupId}?view=progress`);
  await expect(
    studentPage.getByRole('heading', { name: ar ? 'سجل حضورك' : 'Your attendance record' }),
  ).toBeVisible();
  await expect(
    studentPage.getByLabel(
      ar
        ? 'تجربتك (٢٠–١٥٠٠ حرف؛ لا تضف بيانات شخصية)'
        : 'Your experience (20–1,500 characters; no personal information)',
    ),
  ).toBeVisible();
  await studentPage
    .getByLabel(
      ar
        ? 'تجربتك (٢٠–١٥٠٠ حرف؛ لا تضف بيانات شخصية)'
        : 'Your experience (20–1,500 characters; no personal information)',
    )
    .fill(feedbackComment);
  const feedbackForm = studentPage
    .getByLabel(
      ar
        ? 'تجربتك (٢٠–١٥٠٠ حرف؛ لا تضف بيانات شخصية)'
        : 'Your experience (20–1,500 characters; no personal information)',
    )
    .locator('xpath=ancestor::form[1]');
  await feedbackForm.getByRole('button', { name: ar ? 'حفظ' : 'Save' }).click();
  await expect(feedbackForm.getByRole('status')).toBeVisible();
  await studentPage.reload();
  await expect(
    studentPage.getByLabel(
      ar
        ? 'تجربتك (٢٠–١٥٠٠ حرف؛ لا تضف بيانات شخصية)'
        : 'Your experience (20–1,500 characters; no personal information)',
    ),
  ).toHaveValue(feedbackComment);
});
