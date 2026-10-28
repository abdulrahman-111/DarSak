#!/usr/bin/env node

/**
 * Capture the production admin app from a local fixture database.
 * Requires Playwright Core 1.64.0 and Chromium. Credentials and fixture IDs are
 * supplied through the environment so they never enter the repository or manifest.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseURL = process.env.ADMIN_CAPTURE_BASE_URL ?? 'http://localhost:3082';
const email = process.env.ADMIN_CAPTURE_EMAIL;
const password = process.env.ADMIN_CAPTURE_PASSWORD;
const teacherId = process.env.ADMIN_CAPTURE_TEACHER_ID;
const teacherName = process.env.ADMIN_CAPTURE_TEACHER_NAME;
const sourceRevision = '0e3dc958f3db71b39e1048fa44e76db47aea7327';
const outputRoot = path.join(repoRoot, 'docs/screenshots/production/admin');
const manifestPath = path.join(repoRoot, 'docs/screenshots/production/admin-captures.json');
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const routes = [
  {
    path: '/login',
    slug: 'login',
    role: 'guest',
    feature: 'admin sign in',
    headings: { en: 'Administrator portal', ar: 'بوابة الإدارة' },
  },
  {
    path: '/admin',
    slug: 'overview',
    role: 'admin',
    feature: 'admin overview',
    headings: { en: 'Overview', ar: 'نظرة عامة' },
  },
  {
    path: '/admin/teachers',
    slug: 'teachers',
    role: 'admin',
    feature: 'teacher applications',
    headings: { en: 'Teacher requests', ar: 'طلبات المعلمين' },
  },
  {
    path: '/admin/users',
    slug: 'users',
    role: 'admin',
    feature: 'user management',
    headings: { en: 'People', ar: 'المستخدمون' },
  },
  {
    path: '/admin/groups',
    slug: 'groups',
    role: 'admin',
    feature: 'group moderation',
    headings: { en: 'Groups', ar: 'المجموعات' },
  },
  {
    path: '/admin/education',
    slug: 'education',
    role: 'admin',
    feature: 'education catalogue',
    headings: { en: 'Education catalogue', ar: 'الدليل التعليمي' },
  },
  {
    path: '/admin/feedback',
    slug: 'feedback',
    role: 'admin',
    feature: 'student feedback',
    headings: { en: 'Student feedback', ar: 'آراء الطلاب' },
  },
  {
    path: '/admin/reports',
    slug: 'reports',
    role: 'admin',
    feature: 'content reports',
    headings: { en: 'Reports', ar: 'البلاغات' },
  },
  {
    path: '/admin/email',
    slug: 'email',
    role: 'admin',
    feature: 'email delivery',
    headings: { en: 'Email delivery', ar: 'حالة البريد' },
  },
  {
    path: '/admin/health',
    slug: 'health',
    role: 'admin',
    feature: 'operational health',
    headings: { en: 'Operational health', ar: 'حالة التشغيل' },
  },
  {
    path: '/admin/settings',
    slug: 'settings',
    role: 'admin',
    feature: 'platform settings',
    headings: { en: 'Platform settings', ar: 'إعدادات المنصة' },
  },
  {
    path: '/notifications',
    slug: 'notifications',
    role: 'admin',
    feature: 'notifications',
    headings: { en: 'Notifications', ar: 'الإشعارات' },
  },
  {
    path: '/admin/teachers/{teacherId}',
    slug: 'teacher-detail',
    role: 'admin',
    feature: 'teacher application review',
    headings: { en: teacherName, ar: teacherName },
  },
];
const capturedAt = new Date().toISOString();
const results = [];
const selectedSlugs = process.argv
  .slice(2)
  .filter(arg => arg.startsWith('--only='))
  .flatMap(arg => arg.slice('--only='.length).split(','));
const selectedRoutes = selectedSlugs.length
  ? routes.filter(route => selectedSlugs.includes(route.slug))
  : routes;
const retryFailures = process.argv.includes('--retry-failures');

async function loadPlaywright() {
  const configuredModule = process.env.PLAYWRIGHT_MODULE?.trim();
  if (configuredModule) {
    const moduleSpecifier = path.isAbsolute(configuredModule)
      ? pathToFileURL(configuredModule).href
      : configuredModule;
    return import(moduleSpecifier);
  }
  try {
    return await import('playwright-core');
  } catch (importError) {
    const workspaceFallback =
      '/workspace/.dars-browser-tools/node_modules/playwright-core/index.mjs';
    try {
      await fs.access(workspaceFallback);
      console.warn(
        'Using the task workspace Playwright fallback. Set PLAYWRIGHT_MODULE for portable use.',
      );
      return await import(pathToFileURL(workspaceFallback).href);
    } catch {
      throw new Error(
        'Playwright Core 1.64.0 is required. Install it in the environment or set PLAYWRIGHT_MODULE to its package name or absolute entry path.',
        { cause: importError },
      );
    }
  }
}

const { chromium } = await loadPlaywright();

function addRecord(route, locale, viewport, status, details = {}) {
  results.push({
    role: route.role,
    logicalRoute: `/${locale}${route.path.replace('{teacherId}', teacherId ?? '[teacherId]')}`,
    feature: route.feature,
    locale,
    viewport: viewport.name,
    dimensions: { width: viewport.width, height: viewport.height },
    path: `docs/screenshots/production/admin/${route.slug}-${locale}-${viewport.name}.webp`,
    sourceRevision,
    actualEnvironment: 'local',
    capturedAt,
    status,
    ...details,
  });
}

async function login(page, locale) {
  if (!email || !password) throw new Error('Missing ADMIN_CAPTURE_EMAIL or ADMIN_CAPTURE_PASSWORD');
  await page.goto(new URL(`/${locale}/login`, baseURL).href, { waitUntil: 'domcontentloaded' });
  await page
    .getByLabel(locale === 'ar' ? 'البريد الإلكتروني' : 'Email', { exact: true })
    .fill(email);
  await page
    .getByLabel(locale === 'ar' ? 'كلمة المرور' : 'Password', { exact: true })
    .fill(password);
  await page
    .getByRole('button', { name: locale === 'ar' ? 'تسجيل الدخول' : 'Sign in', exact: true })
    .click();
  await page.waitForURL(url => url.pathname === `/${locale}/admin`, { timeout: 20000 });
}

const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  process.env.PLAYWRIGHT_BROWSER_PATH ??
  process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox'],
});
const previousManifest = await fs
  .readFile(manifestPath, 'utf8')
  .then(value => JSON.parse(value))
  .catch(() => []);
const failedKeys = new Set(
  previousManifest
    .filter(entry => entry.status === 'failed')
    .map(entry => `${entry.logicalRoute}:${entry.locale}:${entry.viewport}`),
);
for (const locale of ['en', 'ar']) {
  results.push({
    role: 'admin',
    logicalRoute: `/${locale}`,
    feature: 'locale root redirect',
    locale,
    viewport: 'n/a',
    dimensions: null,
    sourceRevision,
    actualEnvironment: 'local',
    capturedAt,
    status: 'alias',
    target: `/${locale}/admin`,
  });
  results.push({
    role: 'admin',
    logicalRoute: `/${locale}/admin/access`,
    feature: 'legacy access route',
    locale,
    viewport: 'n/a',
    dimensions: null,
    sourceRevision,
    actualEnvironment: 'local',
    capturedAt,
    status: 'alias',
    target: `/${locale}/admin/teachers?status=all`,
  });
}
try {
  for (const route of selectedRoutes) {
    if (route.path.includes('{teacherId}') && !teacherId) {
      for (const locale of ['en', 'ar'])
        for (const viewport of viewports) {
          addRecord(route, locale, viewport, 'blocked', {
            reason: 'Fixture teacher ID is unavailable; no path was guessed.',
          });
        }
      continue;
    }
    for (const locale of ['en', 'ar'])
      for (const viewport of viewports) {
        const logicalRoute = `/${locale}${route.path.replace('{teacherId}', teacherId ?? '[teacherId]')}`;
        if (retryFailures && !failedKeys.has(`${logicalRoute}:${locale}:${viewport.name}`))
          continue;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          isMobile: viewport.name === 'mobile',
          locale: locale === 'ar' ? 'ar' : 'en-US',
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('pageerror', error => consoleErrors.push(error.message));
        const pathPart = route.path.replace('{teacherId}', teacherId ?? '');
        const pathname = `/${locale}${pathPart}`;
        const outputPath = path.join(outputRoot, `${route.slug}-${locale}-${viewport.name}.webp`);
        try {
          if (route.role === 'admin') await login(page, locale);
          const response = await page.goto(new URL(pathname, baseURL).href, {
            waitUntil: 'domcontentloaded',
          });
          if (!response || !response.ok())
            throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
          await page
            .getByRole('heading', { name: route.headings[locale], exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 15000 });
          await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
          await page.evaluate(async () => {
            if (document.fonts?.ready) await document.fonts.ready;
            await new Promise(resolve =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          });
          const current = new URL(page.url());
          if (current.pathname !== pathname)
            throw new Error(`Unexpected redirect to ${current.pathname}`);
          const bodyText = await page.locator('body').innerText();
          if (!bodyText.trim()) throw new Error('Page body is empty');
          if (/something went wrong|internal server error|application error/i.test(bodyText))
            throw new Error('Visible application error state');
          if (
            route.slug === 'teacher-detail' &&
            /teacher not found|profile unavailable/i.test(bodyText)
          )
            throw new Error('Fixture teacher detail did not load');
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await page.screenshot({
            path: outputPath,
            type: 'webp',
            quality: 78,
            fullPage: true,
            animations: 'disabled',
            style: 'nextjs-portal { display: none !important; }',
          });
          addRecord(route, locale, viewport, 'captured', {
            finalURL: `${current.pathname}${current.search}`,
            consoleErrors,
            screenshotStyle: 'Hides the local Next.js development toolbar only.',
          });
          console.log(`captured ${route.slug} ${locale} ${viewport.name}`);
        } catch (error) {
          await fs.rm(outputPath, { force: true }).catch(() => {});
          addRecord(route, locale, viewport, 'failed', {
            error: error instanceof Error ? error.message : String(error),
            consoleErrors,
          });
          console.error(
            `failed ${route.slug} ${locale} ${viewport.name}: ${error instanceof Error ? error.message : error}`,
          );
        } finally {
          await context.close();
        }
      }
  }
} finally {
  await browser.close();
}

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
const existing = previousManifest;
const keys = new Set(
  results.map(
    entry =>
      `${entry.role}:${entry.logicalRoute}:${entry.feature}:${entry.locale}:${entry.viewport}`,
  ),
);
const merged = existing.filter(
  entry =>
    !keys.has(
      `${entry.role}:${entry.logicalRoute}:${entry.feature}:${entry.locale}:${entry.viewport}`,
    ),
);
await fs.writeFile(manifestPath, `${JSON.stringify([...merged, ...results], null, 2)}\n`);
console.log(`Wrote ${results.length} admin capture records to ${manifestPath}`);
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
