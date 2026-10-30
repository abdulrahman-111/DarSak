import { chromium, type FullConfig } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fixtureData, E2E_PROJECT_NAMES, type ActorName } from './data';
import { storageStatePath } from './fixtures';

const actors: ActorName[] = [
  'teacher',
  'student',
  'outsider',
  'passwordStudent',
  'notificationStudent',
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Playwright baseURL must be set.');

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    for (const projectName of E2E_PROJECT_NAMES) {
      if (!config.projects.some(project => project.name === projectName)) continue;
      const data = fixtureData(projectName);
      for (const actor of actors) {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(new URL('/en/login', baseURL).toString());
        const credentials = data.actors[actor];
        await page.locator('input[name="email"]').fill(credentials.email);
        await page.locator('input[name="password"]').fill(credentials.password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 20_000 });

        const statePath = storageStatePath(projectName, actor);
        await mkdir(statePath.slice(0, statePath.lastIndexOf('/')), { recursive: true });
        await context.storageState({ path: statePath });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
