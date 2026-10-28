#!/usr/bin/env node

/** Capture staging-only SanDak and Meet states from the isolated local replica.
 * Credentials are read from the environment and never written to the manifest.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browserModule = '/workspace/.dars-browser-tools/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(browserModule));
const baseURL = process.env.DARSAK_STAGING_URL ?? 'http://127.0.0.1:3083';
const email = process.env.DARSAK_STAGING_TEACHER_EMAIL;
const password = process.env.DARSAK_STAGING_TEACHER_PASSWORD;
if (!email || !password)
  throw new Error(
    'Set DARSAK_STAGING_TEACHER_EMAIL and DARSAK_STAGING_TEACHER_PASSWORD for the local synthetic teacher.',
  );
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
  throw new Error('Staging captures must use the local replica.');

const outputRoot = path.resolve('docs/screenshots/staging');
const manifestPath = path.resolve('docs/screenshots/staging-captures.json');
const sourceRevision = '817d582b8a042ff7c2fd7700b079a973fff7324d';
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const lessonId = 'de200000-0000-4000-8000-000000000001';
const results = [];

function recordKey(entry) {
  return `${entry.logicalRoute}:${entry.feature}:${entry.state}:${entry.locale}:${entry.viewport}`;
}

async function manifestEntries() {
  return fs
    .readFile(manifestPath, 'utf8')
    .then(JSON.parse)
    .catch(() => []);
}

async function hasValidCapture({ locale, viewport, route, feature, state }) {
  const key = recordKey({ logicalRoute: route, feature, state, locale, viewport: viewport.name });
  const entry = (await manifestEntries()).find(candidate => recordKey(candidate) === key);
  if (!entry || entry.sourceRevision !== sourceRevision || entry.status !== 'captured')
    return false;
  try {
    await fs.access(path.resolve(entry.path));
    return true;
  } catch {
    return false;
  }
}

async function writeRecord(record) {
  const entries = await manifestEntries();
  const key = recordKey(record);
  const merged = [...entries.filter(entry => recordKey(entry) !== key), record];
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(merged, null, 2)}\n`);
  await fs.rename(temporaryPath, manifestPath);
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function login(page, locale, pathPart) {
  const target = `/${locale}${pathPart}`;
  await page.goto(new URL(`/${locale}/login?next=${encodeURIComponent(target)}`, baseURL).href, {
    waitUntil: 'domcontentloaded',
  });
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await emailInput.locator('xpath=ancestor::form').locator('button[type="submit"]').click();
  const targetPath = new URL(target, baseURL).pathname;
  await page.waitForURL(url => url.pathname === targetPath, { timeout: 20000 });
  await page.waitForLoadState('domcontentloaded');
}

async function addRecord(entry) {
  const record = {
    path: `docs/screenshots/staging/${entry.slug}-${entry.locale}-${entry.viewport.name}.webp`,
    role: entry.role ?? 'teacher',
    logicalRoute: entry.route,
    feature: entry.feature,
    locale: entry.locale,
    viewport: entry.viewport.name,
    dimensions: { width: entry.viewport.width, height: entry.viewport.height },
    sourceRevision,
    actualEnvironment: 'local',
    status: entry.status,
    state: entry.state,
    ...(entry.note ? { note: entry.note } : {}),
  };
  results.push(record);
  await writeRecord(record);
}

async function capture(
  context,
  {
    locale,
    viewport,
    route,
    slug,
    feature,
    state,
    role,
    actions = [],
    expectedText,
    expectedTexts = [],
    expectedAbsentText,
    expectedButton,
    allowInteractionBlocked = false,
    note,
  },
) {
  if (await hasValidCapture({ locale, viewport, route, feature, state })) {
    console.log(`skip ${slug} ${locale} ${viewport.name}: valid manifest capture exists`);
    return;
  }
  const page = await context.newPage();
  const errors = [];
  const onPageError = error => errors.push(error.message);
  page.on('pageerror', onPageError);
  const output = path.join(outputRoot, `${slug}-${locale}-${viewport.name}.webp`);
  let interactionBlocked = '';
  try {
    await page.goto(new URL(`/${locale}${route}`, baseURL).href, { waitUntil: 'domcontentloaded' });
    await settle(page);
    for (const action of actions) {
      try {
        if (action.type === 'click')
          await page
            .getByRole(action.role ?? 'button', { name: action.name, exact: true })
            .click({ timeout: 3000 });
        else if (action.type === 'fill')
          await page
            .getByLabel(action.label, { exact: false })
            .fill(action.value, { timeout: 3000 });
        else if (action.type === 'wait') await page.waitForTimeout(action.ms ?? 700);
        else if (action.type === 'visibleText')
          await page.waitForFunction(text => document.body?.innerText.includes(text), action.text, {
            timeout: 5000,
          });
      } catch (error) {
        if (!allowInteractionBlocked) throw error;
        interactionBlocked = error instanceof Error ? error.message : String(error);
        break;
      }
    }
    await settle(page);
    const body = await page.locator('body').innerText();
    if (!body.trim()) throw new Error('Empty page');
    if (/something went wrong|internal server error|application error/i.test(body))
      throw new Error('Visible application error');
    for (const text of [expectedText, ...expectedTexts].filter(Boolean)) {
      if (!body.includes(text)) throw new Error(`Expected feature text missing: ${text}`);
    }
    if (expectedAbsentText && body.includes(expectedAbsentText))
      throw new Error(`Unexpected disabled feature UI appeared: ${expectedAbsentText}`);
    if (expectedButton) {
      const button = page.getByRole('button', { name: expectedButton, exact: true });
      if (!(await button.count()) || !(await button.isVisible()))
        throw new Error(`Expected feature control missing: ${expectedButton}`);
    }
    await fs.mkdir(path.dirname(output), { recursive: true });
    await page.screenshot({
      path: output,
      type: 'webp',
      quality: 78,
      fullPage: true,
      animations: 'disabled',
      style: 'nextjs-portal { display: none !important; }',
    });
    const outcomeNote = [
      note,
      interactionBlocked ? `Interactive state blocked: ${interactionBlocked}` : '',
      errors.length ? `page errors: ${errors.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    await addRecord({
      slug,
      locale,
      viewport,
      route,
      feature,
      state,
      role,
      note: outcomeNote || undefined,
      status: interactionBlocked ? 'blocked' : 'captured',
    });
    console.log(
      `${interactionBlocked ? 'blocked' : 'captured'} ${slug} ${locale} ${viewport.name}`,
    );
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => {});
    await addRecord({
      slug,
      locale,
      viewport,
      route,
      feature,
      state,
      role,
      note: error instanceof Error ? error.message : String(error),
      status: 'failed',
    });
    console.error(
      `failed ${slug} ${locale} ${viewport.name}: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    page.off('pageerror', onPageError);
    await page.close().catch(() => {});
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.DARSAK_CHROMIUM_PATH ?? '/usr/bin/chromium',
});
try {
  for (const locale of ['en', 'ar']) {
    for (const viewport of viewports) {
      const publicContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.name === 'mobile',
        locale: locale === 'ar' ? 'ar' : 'en-US',
        reducedMotion: 'reduce',
      });
      try {
        await capture(publicContext, {
          locale,
          viewport,
          route: '/',
          slug: 'staging-landing',
          feature: 'Staging public landing',
          state: 'signed-out staging feature highlights',
          role: 'guest',
          expectedTexts:
            locale === 'ar'
              ? [
                  'تجارب محدودة',
                  'مساعد سندك الدراسي: معاينة محدودة للمختبرين البالغين.',
                  'إعداد حصص Google Meet: تجربة تتطلب ربط حساب Google وإكمال الإعداد.',
                ]
              : [
                  'Limited pilots',
                  'SanDak study assistant: limited preview for adult testers.',
                  'Google Meet lesson setup: a pilot that requires Google account connection and setup.',
                ],
          note: 'Signed-out local staging landing page with the SanDak and Google Meet pilot feature highlights.',
        });
        await capture(publicContext, {
          locale,
          viewport,
          route: '/',
          slug: 'sandak-public-drawer',
          feature: 'SanDak public guidance',
          state: 'guest help drawer',
          role: 'guest',
          expectedText: locale === 'ar' ? 'تجارب محدودة' : 'Limited pilots',
          expectedButton: locale === 'ar' ? 'فتح سندك' : 'Open SanDak',
          allowInteractionBlocked: true,
          actions: [
            { type: 'click', name: locale === 'ar' ? 'فتح سندك' : 'Open SanDak' },
            {
              type: 'visibleText',
              text:
                locale === 'ar'
                  ? 'يمكنك تصفح المساعدة العامة، أو تسجيل الدخول للوصول إلى الإرشادات المناسبة لحسابك.'
                  : 'Browse public help, or sign in to see guidance for your account.',
            },
          ],
          note: 'Signed-out public help drawer; no authenticated account information is shown.',
        });
      } finally {
        await publicContext.close().catch(() => {});
      }
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.name === 'mobile',
        locale: locale === 'ar' ? 'ar' : 'en-US',
        reducedMotion: 'reduce',
      });
      const loginPage = await context.newPage();
      try {
        await login(loginPage, locale, '/teacher');
        await settle(loginPage);
        await loginPage.close().catch(() => {});
        await capture(context, {
          locale,
          viewport,
          route: '/account/integrations',
          slug: 'meet-integrations-disabled',
          feature: 'Google Meet',
          state: 'pilot disabled by local environment',
          expectedText:
            locale === 'ar'
              ? 'Google Meet غير متاح في بيئة هذا الحساب حاليًا. لا تربط حساب Google؛ تواصل مع مسؤول التجربة لإعداد بيئة الاختبار.'
              : 'Google Meet is not available in this account environment yet. Do not connect Google; contact the pilot administrator to configure the staging environment.',
          note: 'Staging source UI; local replica has no Google provider credentials and the pilot gate remains closed.',
        });
        await capture(context, {
          locale,
          viewport,
          route: `/teacher/lessons/${lessonId}`,
          slug: 'meet-lesson-disabled',
          feature: 'Google Meet',
          state: 'meeting controls unavailable',
          expectedText: locale === 'ar' ? 'حل المعادلات الخطية' : 'Solving Linear Equations',
          expectedAbsentText: locale === 'ar' ? 'اجتماع الحصة' : 'Lesson meeting',
          note: 'Synthetic lesson record. The local APP_ENV is local and the Google Meet pilot gate is closed, so this lesson route omits the meeting card and manual-link controls; no meeting was created.',
        });
        await capture(context, {
          locale,
          viewport,
          route: '/teacher/groups/new',
          slug: 'sandak-group-template',
          feature: 'SanDak group drafting',
          state: 'authored local template',
          expectedText: locale === 'ar' ? 'مسودة قالب محلية' : 'Local group template',
          allowInteractionBlocked: true,
          actions: [
            {
              type: 'fill',
              label: locale === 'ar' ? 'موضوع المجموعة' : 'Group topic',
              value: locale === 'ar' ? 'الجبر' : 'Algebra',
            },
            {
              type: 'click',
              name: locale === 'ar' ? 'إنشاء معاينة القالب' : 'Create template preview',
            },
            {
              type: 'visibleText',
              text:
                locale === 'ar'
                  ? 'تم إنشاء معاينة محلية. راجع الحقول الأربعة وعدّلها قبل التطبيق.'
                  : 'Local preview created. Review and edit all four fields before applying.',
            },
          ],
          note: 'Authored local template only; no AI provider response is represented.',
        });
        await capture(context, {
          locale,
          viewport,
          route: '/teacher/groups/new',
          slug: 'sandak-draft-unavailable',
          feature: 'SanDak group drafting',
          state: 'live provider unavailable',
          expectedText: locale === 'ar' ? 'مسودة قالب محلية' : 'Local group template',
          allowInteractionBlocked: true,
          actions: [
            {
              type: 'click',
              name: locale === 'ar' ? 'إنشاء بمساعدة سندك' : 'Generate with SanDak',
            },
            {
              type: 'visibleText',
              text:
                locale === 'ar'
                  ? 'المساعدة المباشرة غير متاحة الآن. يمكنك استخدام القالب المحلي.'
                  : 'Live help is unavailable right now. You can use the local template.',
            },
          ],
          note: 'The provider gate is closed in the local replica; no generation request or successful response is claimed.',
        });
        await capture(context, {
          locale,
          viewport,
          route: '/teacher',
          slug: 'sandak-guidance-drawer',
          feature: 'SanDak local guidance',
          state: 'local guidance drawer',
          expectedText:
            locale === 'ar'
              ? 'نظرة واضحة على مجموعاتك وحصصك وطلبات الطلاب.'
              : 'A clear view of your groups, lessons, and student requests.',
          expectedButton: locale === 'ar' ? 'فتح سندك' : 'Open SanDak',
          allowInteractionBlocked: true,
          actions: [
            { type: 'click', name: locale === 'ar' ? 'فتح سندك' : 'Open SanDak' },
            {
              type: 'visibleText',
              text:
                locale === 'ar'
                  ? 'هذه إرشادات محلية وقوالب موجّهة. لا تستخدم ذكاءً اصطناعيًا مباشرًا.'
                  : 'These local guidance topics run on this device and do not use live AI.',
            },
          ],
          note: 'Local authored guidance UI.',
        });
        await capture(context, {
          locale,
          viewport,
          route: '/teacher',
          slug: 'sandak-chat-unavailable',
          feature: 'SanDak chat',
          state: 'provider unavailable',
          expectedText:
            locale === 'ar'
              ? 'نظرة واضحة على مجموعاتك وحصصك وطلبات الطلاب.'
              : 'A clear view of your groups, lessons, and student requests.',
          expectedButton: locale === 'ar' ? 'فتح سندك' : 'Open SanDak',
          allowInteractionBlocked: true,
          actions: [
            { type: 'click', name: locale === 'ar' ? 'فتح سندك' : 'Open SanDak' },
            { type: 'click', role: 'tab', name: locale === 'ar' ? 'سندك' : 'SanDak' },
            {
              type: 'visibleText',
              text:
                locale === 'ar'
                  ? 'المساعدة المباشرة غير متاحة الآن. يمكنك استخدام الإرشادات المحلية.'
                  : 'Live help is unavailable right now. You can use local guidance.',
            },
          ],
          note: 'Provider unavailable state from closed local gate; no provider response is represented.',
        });
      } finally {
        await context.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close();
}

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
const existing = await manifestEntries();
const keys = new Set(
  results.map(
    entry =>
      `${entry.logicalRoute}:${entry.feature}:${entry.state}:${entry.locale}:${entry.viewport}`,
  ),
);
const merged = existing.filter(
  entry =>
    !keys.has(
      `${entry.logicalRoute}:${entry.feature}:${entry.state}:${entry.locale}:${entry.viewport}`,
    ),
);
await fs.writeFile(manifestPath, `${JSON.stringify([...merged, ...results], null, 2)}\n`);
console.log(
  `Staging manifest now has ${(await manifestEntries()).length} records at ${manifestPath}`,
);
if (results.some(entry => entry.status === 'failed')) process.exitCode = 1;
