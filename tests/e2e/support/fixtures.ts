import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { fixtureData } from './data';

export function storageStatePath(projectName: string, actor: string): string {
  return join(process.cwd(), '.playwright', 'auth', projectName, `${actor}.json`);
}

type ActorPage = { page: Page; context: BrowserContext };

async function actorPage(
  browser: import('@playwright/test').Browser,
  projectName: string,
  baseURL: string | undefined,
  actor:
    | 'teacher'
    | 'student'
    | 'outsider'
    | 'passwordStudent'
    | 'notificationStudent'
    | 'liveNotificationStudent'
    | 'accessTeacher'
    | 'ratingsTeacher'
    | 'ratingsStudent'
    | 'meetingTeacher'
    | 'meetingStudent',
): Promise<ActorPage> {
  const mobile = projectName.endsWith('mobile');
  const context = await browser.newContext({
    storageState: storageStatePath(projectName, actor),
    baseURL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: projectName.startsWith('ar-') ? 'ar-EG' : 'en-US',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
  });
  return { context, page: await context.newPage() };
}

export const test = base.extend<{
  teacherPage: Page;
  studentPage: Page;
  outsiderPage: Page;
  passwordPage: Page;
  notificationPage: Page;
  liveNotificationPage: Page;
  accessTeacherPage: Page;
  ratingsTeacherPage: Page;
  ratingsStudentPage: Page;
  meetingTeacherPage: Page;
  meetingStudentPage: Page;
}>({
  teacherPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'teacher',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  studentPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'student',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  outsiderPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'outsider',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  passwordPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'passwordStudent',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  notificationPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'notificationStudent',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  liveNotificationPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'liveNotificationStudent',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  accessTeacherPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'accessTeacher',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  ratingsTeacherPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'ratingsTeacher',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  ratingsStudentPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'ratingsStudent',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  meetingTeacherPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'meetingTeacher',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
  meetingStudentPage: async ({ browser }, provide, testInfo) => {
    const fixture = await actorPage(
      browser,
      testInfo.project.name,
      process.env.E2E_BASE_URL ?? testInfo.project.use.baseURL,
      'meetingStudent',
    );
    await provide(fixture.page);
    await fixture.context.close();
  },
});

export { expect } from '@playwright/test';
export { fixtureData };
