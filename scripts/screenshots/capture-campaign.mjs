#!/usr/bin/env node

/**
 * Capture a short campaign-ready set of real DarSak views from the local
 * production app. Credentials are read at runtime from the private synthetic
 * fixture file and are never written to this script or the manifest.
 *
 * Options: --base-url, --fixtures, --output, --revision, --playwright-module,
 * --browser. Equivalent DARSAK_CAMPAIGN_* environment variables are accepted.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function option(name, envName, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : (process.env[envName] ?? fallback);
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
const baseURL = option('base-url', 'DARSAK_CAMPAIGN_URL', 'http://127.0.0.1:3081');
const fixturePath = path.resolve(
  option(
    'fixtures',
    'DARSAK_CAMPAIGN_FIXTURES',
    '/workspace/shared/dars-screenshots/fixtures.json',
  ),
);
const outputRoot = path.resolve(
  option('output', 'DARSAK_CAMPAIGN_OUTPUT', path.join(repoRoot, 'docs/screenshots/campaign')),
);
const manifestPath = path.join(outputRoot, 'campaign-captures.json');
const sourceRevision = option(
  'revision',
  'DARSAK_CAMPAIGN_REVISION',
  '0e3dc958f3db71b39e1048fa44e76db47aea7327',
);
const playwrightPath = path.resolve(
  option(
    'playwright-module',
    'DARSAK_PLAYWRIGHT_MODULE',
    '/workspace/.dars-browser-tools/node_modules/playwright-core/index.mjs',
  ),
);
const browserPath = option('browser', 'DARSAK_CHROMIUM_PATH', '/usr/bin/chromium');

const appOrigin = new URL(baseURL);
if (!['localhost', '127.0.0.1'].includes(appOrigin.hostname)) {
  throw new Error('Campaign screenshots must use the local synthetic app.');
}

const fixtures = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const { chromium } = await import(pathToFileURL(playwrightPath));
const { published_group_id: groupId } = fixtures.records;
const teacher = fixtures.auth.accounts.teacher;
const student = fixtures.auth.accounts.student;
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const shots = [
  {
    slug: 'home-hero',
    title: 'Home and teacher discovery hero',
    route: '/',
    role: 'guest',
    heading: {
      en: 'Find a teacher who fits your learning goals.',
      ar: 'اختر معلمًا يناسب أهدافك في التعلّم.',
    },
  },
  {
    slug: 'teacher-public-profile',
    title: 'Public teacher profile',
    route: `/teachers/${teacher.id}`,
    role: 'guest',
    heading: { en: 'Amina Nour | أمينة نور', ar: 'Amina Nour | أمينة نور' },
  },
  {
    slug: 'published-group-detail',
    title: 'Published learning group detail and enrollment',
    route: `/groups/${groupId}`,
    role: 'guest',
    heading: {
      en: 'Algebra Foundations | أساسيات الجبر',
      ar: 'Algebra Foundations | أساسيات الجبر',
    },
  },
  {
    slug: 'student-dashboard',
    title: 'Student learning dashboard',
    route: '/student',
    role: 'student',
    heading: { en: /^Welcome back,\s*Youssef\b/, ar: /^أهلاً,\s*Youssef\b/ },
  },
  {
    slug: 'student-timetable',
    title: 'Student timetable',
    route: '/timetable',
    role: 'student',
    heading: { en: 'My timetable', ar: 'جدولي الدراسي' },
  },
  {
    slug: 'student-class-materials',
    title: 'Enrolled class materials workspace',
    route: `/student/classes/${groupId}?view=materials`,
    role: 'student',
    heading: {
      en: 'Algebra Foundations | أساسيات الجبر',
      ar: 'Algebra Foundations | أساسيات الجبر',
    },
    selectedTab: { en: 'Materials', ar: 'المواد' },
  },
  {
    slug: 'teacher-dashboard',
    title: 'Teacher dashboard',
    route: '/teacher',
    role: 'teacher',
    heading: { en: /^Welcome,\s*Amina\b/, ar: /^مرحباً,\s*Amina\b/ },
  },
  {
    slug: 'teacher-group-management',
    title: 'Teacher group management and schedule',
    route: `/teacher/groups/${groupId}`,
    role: 'teacher',
    heading: {
      en: 'Algebra Foundations | أساسيات الجبر',
      ar: 'Algebra Foundations | أساسيات الجبر',
    },
  },
];
const accounts = { student, teacher };
const results = [];
const previousManifest = await fs
  .readFile(manifestPath, 'utf8')
  .then(JSON.parse)
  .catch(() => []);
const retryFailedOnly = process.argv.includes('--retry-failed');
const failedKeys = new Set(
  previousManifest
    .filter(entry => entry.status === 'failed')
    .map(entry => `${entry.slug}:${entry.locale}:${entry.viewport}`),
);
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--no-sandbox'],
});

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function login(page, account) {
  await page.goto(new URL('/en/login', baseURL).href, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(fixtures.auth.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(url => url.pathname !== '/en/login' && !url.pathname.includes('/admin'), {
    timeout: 20000,
  });
}

try {
  for (const shot of shots) {
    for (const locale of ['en', 'ar']) {
      for (const viewport of viewports) {
        if (retryFailedOnly && !failedKeys.has(`${shot.slug}:${locale}:${viewport.name}`)) continue;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 2,
          isMobile: viewport.name === 'mobile',
          locale: locale === 'ar' ? 'ar' : 'en-US',
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        const targetPath = `/${locale}${shot.route}`;
        const outputPath = path.join(outputRoot, `${shot.slug}-${locale}-${viewport.name}.png`);
        const result = {
          path: path.relative(repoRoot, outputPath),
          slug: shot.slug,
          title: shot.title,
          role: shot.role,
          logicalRoute: shot.route,
          locale,
          viewport: viewport.name,
          cssDimensions: { width: viewport.width, height: viewport.height },
          pixelDimensions: { width: viewport.width * 2, height: viewport.height * 2 },
          sourceRevision,
          actualEnvironment: 'local synthetic database; no hosted data',
          capturedAt: new Date().toISOString(),
        };
        try {
          if (shot.role !== 'guest') await login(page, accounts[shot.role]);
          const response = await page.goto(new URL(targetPath, baseURL).href, {
            waitUntil: 'domcontentloaded',
          });
          if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
          await page.locator('h1:visible').first().waitFor({ state: 'visible', timeout: 12000 });
          await settle(page);
          const current = new URL(page.url());
          if (current.pathname.includes('/admin'))
            throw new Error('Refusing to capture an admin URL');
          const expectedPath = `${targetPath.split('?')[0].replace(/\/$/, '')}${targetPath.includes('?') ? `?${targetPath.split('?').slice(1).join('?')}` : ''}`;
          if (`${current.pathname}${current.search}` !== expectedPath) {
            throw new Error(
              `Unexpected final route: ${current.pathname}${current.search}; expected ${expectedPath}`,
            );
          }
          const bodyText = await page.locator('body').innerText();
          if (!bodyText.trim()) throw new Error('Page body is empty');
          if (
            /something went wrong|internal server error|application error|not found/i.test(bodyText)
          ) {
            throw new Error('Visible application error or not-found state');
          }
          const heading = (await page.locator('h1:visible').first().innerText()).trim();
          const expectedHeading = shot.heading[locale];
          if (
            typeof expectedHeading === 'string'
              ? heading !== expectedHeading
              : !expectedHeading.test(heading)
          ) {
            throw new Error(`Wrong feature heading: ${JSON.stringify(heading)}`);
          }
          if (shot.selectedTab) {
            const navigationLabel = locale === 'ar' ? 'أقسام المجموعة' : 'Class sections';
            const selectedTab = page
              .getByRole('navigation', { name: navigationLabel })
              .locator('a[aria-current="page"]');
            await selectedTab.waitFor({ state: 'visible', timeout: 3000 });
            const selectedTabText = (await selectedTab.innerText()).trim();
            if (selectedTabText !== shot.selectedTab[locale]) {
              throw new Error(`Wrong class workspace tab: ${JSON.stringify(selectedTabText)}`);
            }
          }
          const headingBounds = await page.locator('h1:visible').first().boundingBox();
          if (!headingBounds || headingBounds.y > viewport.height)
            throw new Error('Feature heading is outside the captured viewport');
          await fs.mkdir(outputRoot, { recursive: true });
          await page.screenshot({
            path: outputPath,
            type: 'png',
            fullPage: false,
            animations: 'disabled',
            style: 'nextjs-portal { display: none !important; }',
          });
          result.status = 'captured';
          result.finalPath = `${current.pathname}${current.search}`;
          result.heading = heading;
          result.pageErrors = pageErrors;
          console.log(`captured ${shot.slug} ${locale} ${viewport.name}: ${heading}`);
        } catch (error) {
          await fs.rm(outputPath, { force: true }).catch(() => {});
          result.status = 'failed';
          result.error = error instanceof Error ? error.message : String(error);
          result.pageErrors = pageErrors;
          console.error(`failed ${shot.slug} ${locale} ${viewport.name}: ${result.error}`);
        } finally {
          results.push(result);
          await context.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}

await fs.mkdir(outputRoot, { recursive: true });
const replacements = new Set(
  results.map(entry => `${entry.slug}:${entry.locale}:${entry.viewport}`),
);
const merged = previousManifest.filter(
  entry => !replacements.has(`${entry.slug}:${entry.locale}:${entry.viewport}`),
);
await fs.writeFile(manifestPath, `${JSON.stringify([...merged, ...results], null, 2)}\n`);
console.log(
  `Wrote ${results.length} campaign records; ${results.filter(result => result.status === 'captured').length} captured.`,
);
if (results.some(result => result.status !== 'captured')) process.exitCode = 1;
