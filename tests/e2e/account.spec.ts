import { test, expect, fixtureData } from './support/fixtures';

const changedPassword = 'E2E-local-only-changed-2026!';

test('password change takes effect and can be restored; deletion form requires all safeguards', async ({
  passwordPage,
}) => {
  const project = test.info().project.name;
  const locale = project.startsWith('ar-') ? 'ar' : 'en';
  const { actors } = fixtureData(project);
  const loginName = locale === 'ar' ? 'تسجيل الدخول' : 'Sign in';
  const logoutName = locale === 'ar' ? 'تسجيل الخروج' : 'Log out';
  const accountSecurity = `/${locale}/account/security`;

  await passwordPage.goto(accountSecurity);
  await passwordPage.locator('input[name="currentPassword"]').fill(actors.passwordStudent.password);
  await passwordPage.locator('input[name="password"]').fill(changedPassword);
  await passwordPage.locator('input[name="confirmPassword"]').fill(changedPassword);
  await passwordPage
    .getByRole('button', { name: locale === 'ar' ? 'تحديث كلمة المرور' : 'Update password' })
    .click();
  await expect(passwordPage).toHaveURL(new RegExp(`/${locale}/student`));

  await passwordPage.getByRole('button', { name: logoutName }).click();
  await expect(passwordPage).toHaveURL(/\/$/);
  await passwordPage.goto(`/${locale}/login`);
  const signIn = async (password: string, expectSuccess = false) => {
    await passwordPage.locator('input[name="email"]').fill(actors.passwordStudent.email);
    await passwordPage.locator('input[name="password"]').fill(password);
    const submit = passwordPage.getByRole('button', { name: loginName });
    if (expectSuccess) {
      await Promise.all([
        passwordPage.waitForURL(url => !url.pathname.endsWith('/login')),
        submit.click(),
      ]);
    } else {
      await submit.click();
    }
  };
  await signIn(actors.passwordStudent.password);
  await expect(
    passwordPage.getByText(
      locale === 'ar'
        ? 'تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.'
        : 'Unable to sign in. Check your credentials and try again.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(passwordPage).toHaveURL(new RegExp(`/${locale}/login`));

  await passwordPage.reload();
  await signIn(changedPassword, true);
  await passwordPage.goto(accountSecurity);
  await passwordPage.locator('input[name="currentPassword"]').fill(changedPassword);
  await passwordPage.locator('input[name="password"]').fill(actors.passwordStudent.password);
  await passwordPage.locator('input[name="confirmPassword"]').fill(actors.passwordStudent.password);
  await passwordPage
    .getByRole('button', { name: locale === 'ar' ? 'تحديث كلمة المرور' : 'Update password' })
    .click();
  await expect(passwordPage).toHaveURL(new RegExp(`/${locale}/student`));

  await passwordPage.goto(`/${locale}/account/delete`);
  const deletionForm = passwordPage
    .locator('form')
    .filter({ has: passwordPage.locator('input[name="confirmation"]') })
    .last();
  await expect(deletionForm).toBeVisible();
  const password = deletionForm.locator('input[name="password"]');
  const acknowledgement = deletionForm.locator('input[name="acknowledged"]');
  const confirmation = deletionForm.locator('input[name="confirmation"]');
  expect(await password.getAttribute('required')).not.toBeNull();
  expect(await acknowledgement.getAttribute('required')).not.toBeNull();
  expect(await confirmation.getAttribute('required')).not.toBeNull();
  expect(await confirmation.getAttribute('pattern')).toBe('DELETE');

  const initiallyValid = await deletionForm.evaluate((form: HTMLFormElement) =>
    form.checkValidity(),
  );
  expect(initiallyValid).toBe(false);
  await password.fill(actors.passwordStudent.password);
  expect(await deletionForm.evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
  await acknowledgement.check();
  expect(await deletionForm.evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
  await confirmation.fill('DELETE');
  expect(await deletionForm.evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(true);

  // Do not submit the destructive form. The signed-in session proves the account remains active.
  await expect(
    passwordPage.getByRole('heading', {
      name: locale === 'ar' ? 'حذف حسابك نهائيًا' : 'Permanently delete your account',
    }),
  ).toBeVisible();
  await expect(passwordPage.locator('input[name="confirmation"]')).toHaveValue('DELETE');
});
