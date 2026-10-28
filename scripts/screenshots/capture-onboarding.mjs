#!/usr/bin/env node

/** Capture real student and teacher onboarding wizard stages from local fixtures.
 * Credentials are read from the private fixture file and never enter artifacts.
 * --retry-missing resumes failed/absent images while retaining per-shot checkpoints.
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function option(name, envName, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : (process.env[envName] ?? fallback);
}

const root = path.resolve(import.meta.dirname, '../..');
const baseURL = option('base-url', 'DARSAK_ONBOARDING_URL', 'http://127.0.0.1:3081');
const fixturePath = path.resolve(
  option(
    'fixtures',
    'DARSAK_ONBOARDING_FIXTURES',
    '/workspace/shared/dars-screenshots/fixtures.json',
  ),
);
const outputRoot = path.resolve(
  option('output', 'DARSAK_ONBOARDING_OUTPUT', path.join(root, 'docs/screenshots/production')),
);
const manifestPath = path.join(outputRoot, 'onboarding-captures.json');
const sourceRevision = option(
  'revision',
  'DARSAK_ONBOARDING_REVISION',
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
const origin = new URL(baseURL);
if (!['localhost', '127.0.0.1'].includes(origin.hostname))
  throw new Error('Onboarding captures must use the local synthetic app.');

const fixtures = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const { chromium } = await import(pathToFileURL(playwrightPath));
const locales = ['en', 'ar'];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const roles = [
  {
    role: 'student',
    account: fixtures.auth.accounts.onboarding_student,
    lastStage: 2,
    stages: [
      { slug: 'about', title: { en: 'About you', ar: 'معلومات عنك' }, marker: '#about-full_name' },
      {
        slug: 'learning',
        title: { en: 'Your learning', ar: 'تعلمك' },
        marker: '#learning-interests',
      },
      { slug: 'review', title: { en: 'Review and finish', ar: 'المراجعة والإكمال' }, review: true },
    ],
  },
  {
    role: 'teacher',
    account: fixtures.auth.accounts.onboarding_teacher,
    lastStage: 4,
    stages: [
      { slug: 'about', title: { en: 'About you', ar: 'معلومات عنك' }, marker: '#about-full_name' },
      {
        slug: 'background',
        title: { en: 'Your background', ar: 'خبراتك' },
        marker: '#details-about-en',
      },
      {
        slug: 'offerings',
        title: { en: 'What you teach', ar: 'ما الذي تدرّسه' },
        marker: '#offering_ids',
      },
      {
        slug: 'verification',
        title: { en: 'Contact and verification', ar: 'بيانات التواصل والتحقق' },
        marker: '#attested',
      },
      { slug: 'review', title: { en: 'Review and submit', ar: 'المراجعة والإرسال' }, review: true },
    ],
  },
];
const titleText = { en: 'Set up your account', ar: 'إعداد الحساب' };
const oldManifest = await fs
  .readFile(manifestPath, 'utf8')
  .then(JSON.parse)
  .catch(() => []);
const oldByKey = new Map(
  oldManifest.map(entry => [
    `${entry.role}:${entry.stage}:${entry.locale}:${entry.viewport}`,
    entry,
  ]),
);
const retryMissing = process.argv.includes('--retry-missing');
const refresh = process.argv.includes('--refresh');
const selectedRole = option('role', 'DARSAK_ONBOARDING_ROLE', 'all');
const browser = await chromium.launch({
  headless: true,
  executablePath: browserPath,
  args: ['--no-sandbox'],
});

function shotKey(role, stage, locale, viewport) {
  return `${role}:${stage}:${locale}:${viewport}`;
}

async function activeStage(page, locale) {
  const progress = page.locator(
    locale === 'ar' ? 'ol[aria-label="مراحل الإعداد"]' : 'ol[aria-label="Setup progress"]',
  );
  return progress.evaluate(
    node =>
      Array.from(node.children).findIndex(child => child.getAttribute('aria-current') === 'step') +
      1,
  );
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function clickWizard(page, locale, label) {
  const nav = page.getByRole('navigation', {
    name: locale === 'ar' ? 'التنقل' : 'Wizard controls',
    exact: true,
  });
  await nav.getByRole('button', { name: label, exact: true }).click();
}

async function goBackToFirstStage(page, role, locale) {
  for (
    let current = await activeStage(page, locale);
    current > 1;
    current = await activeStage(page, locale)
  ) {
    const target = current - 1;
    await clickWizard(page, locale, locale === 'ar' ? 'رجوع' : 'Back');
    await page.waitForFunction(
      expected => {
        const list = document.querySelector(
          'ol[aria-label="Setup progress"], ol[aria-label="مراحل الإعداد"]',
        );
        return (
          list &&
          Array.from(list.children).findIndex(
            child => child.getAttribute('aria-current') === 'step',
          ) +
            1 ===
            expected
        );
      },
      target,
      { timeout: 15000 },
    );
  }
  if (role === 'student' && (await activeStage(page, locale)) !== 1)
    throw new Error('Could not restore the student wizard to stage 1.');
}

async function fillStudent(page, locale, stage) {
  if (stage === 1) {
    await page.locator('#about-full_name').fill('Layla Hassan');
    await page.locator('#age_range').selectOption('16_17');
    await page.locator('#about-school_name').fill('Independent Learning Program');
  } else if (stage === 2) {
    await page
      .locator('#learning-education_year')
      .fill(locale === 'ar' ? 'الصف العاشر' : 'Grade 10');
    await page
      .locator('#learning-interests')
      .fill(locale === 'ar' ? 'الرياضيات، الروبوتات، القراءة' : 'mathematics, robotics, reading');
    await page
      .locator('#learning-learning_goal')
      .fill(
        locale === 'ar'
          ? 'أريد أن أبني ثقتي في الجبر وأحل المعادلات خطوة بخطوة.'
          : 'I want to build confidence in algebra and solve equations step by step.',
      );
  }
}

async function fillTeacher(page, locale, stage) {
  if (stage === 1) {
    await page.locator('#about-full_name').fill('Karim Adel');
    await page.locator('#about-headline').fill('Mathematics tutor for secondary students');
    await page.locator('#languages').fill('Arabic, English');
    await page.locator('#languages').blur();
  } else if (stage === 2) {
    await page
      .locator('#details-about-en')
      .fill(
        'I help secondary students build confidence in mathematics through clear explanations, guided examples, and steady practice.',
      );
    await page
      .locator('#details-about-ar')
      .fill(
        'أساعد طلاب المرحلة الثانوية على بناء الثقة في الرياضيات من خلال الشرح الواضح والأمثلة الموجّهة والتدريب المنتظم.',
      );
    await page
      .locator('#details-approach-en')
      .fill(
        'I begin with a short check-in, explain one idea at a time, then use guided problems and encouraging feedback.',
      );
    await page
      .locator('#details-approach-ar')
      .fill(
        'أبدأ بمراجعة قصيرة، وأشرح فكرة واحدة في كل مرة، ثم أستخدم مسائل موجهة وملاحظات مشجعة.',
      );
    await page.locator('#background-teaching_years').fill('8');
    const experience = page.locator('#experience');
    if (!(await experience.locator('input[id="experience-0-title-en"]').count())) {
      await experience
        .getByRole('button', { name: locale === 'ar' ? 'إضافة' : 'Add', exact: true })
        .click();
    }
    await page.locator('#experience-0-title-en').fill('Mathematics tutor');
    await page.locator('#experience-0-title-ar').fill('معلم رياضيات');
    await page.locator('#experience-0-organization-en').fill('Independent tutoring');
    await page.locator('#experience-0-organization-ar').fill('التدريس المستقل');
    await page
      .locator('#experience-0-description-en')
      .fill(
        'Support secondary learners with guided algebra practice, clear examples, and steady feedback.',
      );
    await page
      .locator('#experience-0-description-ar')
      .fill('أدعم طلاب المرحلة الثانوية بتدريب موجّه على الجبر وأمثلة واضحة وملاحظات منتظمة.');
    await page.locator('#experience-0-start_year').fill('2018');
    const current = page.locator('#experience').locator('input[type="checkbox"]').first();
    if (!(await current.isChecked())) await current.check();
  } else if (stage === 3) {
    const options = page.locator('#offering_ids input[type="checkbox"]');
    if (await options.count()) {
      const choices = await options.evaluateAll(inputs =>
        inputs.map(input => ({
          checked: input.checked,
          label: input.parentElement?.innerText ?? '',
        })),
      );
      const preferred = choices.findIndex(choice =>
        /mathematics|رياضيات|الرياضيات/i.test(choice.label),
      );
      const selectedIndex = preferred >= 0 ? preferred : 0;
      for (let index = 0; index < choices.length; index++) {
        if (index !== selectedIndex && choices[index].checked) await options.nth(index).uncheck();
      }
      if (!(await options.nth(selectedIndex).isChecked())) await options.nth(selectedIndex).check();
      return;
    }
    // The incomplete teacher fixture starts without a catalogue combination.
    // Add one through the real UI using existing subject and level options.
    const selects = page.locator('#offering_ids select');
    if ((await selects.count()) < 2)
      throw new Error('No subject and level choices are available for this teacher.');
    for (let i = 0; i < 2; i++) {
      const select = selects.nth(i);
      const rows = await select
        .locator('option')
        .evaluateAll(options =>
          options
            .map(o => ({ value: o.value, label: o.textContent?.trim() ?? '' }))
            .filter(o => o.value),
        );
      if (!rows.length)
        throw new Error('The teacher catalogue has no selectable subject or level.');
      const preferred =
        i === 0 ? /mathematics|رياضيات/i : /secondary|high school|grade 10|stage|ثانوي|عاشر/i;
      const chosen = rows.find(row => preferred.test(row.label)) ?? rows[0];
      await select.selectOption(chosen.value);
    }
    await page
      .locator('#offering_ids')
      .getByRole('button', { name: locale === 'ar' ? 'إضافة' : 'Add combination', exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('#offering_ids input[type="checkbox"]').length > 0,
      undefined,
      { timeout: 15000 },
    );
    await page.locator('#offering_ids input[type="checkbox"]').first().check();
  } else if (stage === 4) {
    await page.locator('#verification-admin_phone').fill('+1 202-555-0123');
    const attested = page.locator('#attested');
    if (!(await attested.isChecked())) await attested.check();
  }
}

async function capturePanel(page, roleInfo, locale, viewport, stageInfo, stageNumber) {
  const expectedIndex = stageInfo.review ? roleInfo.lastStage + 1 : stageNumber;
  const actualIndex = await activeStage(page, locale);
  if (actualIndex !== expectedIndex)
    throw new Error(`Wrong wizard panel: progress step ${actualIndex}; expected ${expectedIndex}.`);
  await page
    .getByRole('heading', { level: 1, name: titleText[locale], exact: true })
    .waitFor({ state: 'visible', timeout: 10000 });
  if (stageInfo.marker)
    await page.locator(stageInfo.marker).waitFor({ state: 'visible', timeout: 10000 });
  if (stageInfo.review)
    await page
      .getByRole('heading', { level: 2, name: stageInfo.title[locale], exact: true })
      .waitFor({ state: 'visible', timeout: 10000 });
  const body = await page.locator('body').innerText();
  if (
    /could not load your saved setup|تعذر تحميل الإعداد المحفوظ|something went wrong|internal server error|application error/i.test(
      body,
    )
  ) {
    throw new Error('Visible onboarding error state.');
  }
  await settle(page);
  // Controls near the bottom can scroll long panels before a full-page shot.
  // Restore the document origin so fixed headers stay at the actual page top.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const slug = `onboarding-${roleInfo.role}-${stageInfo.slug}-${locale}-${viewport.name}`;
  const output = path.join(outputRoot, `${slug}.webp`);
  await page.screenshot({
    path: output,
    type: 'webp',
    quality: 78,
    fullPage: true,
    animations: 'disabled',
    style: 'nextjs-portal { display: none !important; }',
  });
  return {
    path: path.relative(root, output),
    role: roleInfo.role,
    feature: `${roleInfo.role} onboarding · ${stageInfo.slug}`,
    stage: stageInfo.slug,
    stageLabel: stageInfo.title[locale],
    logicalRoute: '/account/setup',
    locale,
    viewport: viewport.name,
    cssDimensions: { width: viewport.width, height: viewport.height },
    sourceRevision,
    actualEnvironment: 'local',
    demoProvenance:
      'Synthetic onboarding account with fictional profile details entered through the real UI; setup was not submitted or completed.',
    capturedAt: new Date().toISOString(),
    status: 'captured',
  };
}

async function checkpoint(entry) {
  const key = shotKey(entry.role, entry.stage, entry.locale, entry.viewport);
  oldByKey.set(key, entry);
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify([...oldByKey.values()], null, 2)}\n`);
}

try {
  for (const roleInfo of roles) {
    if (selectedRole !== 'all' && selectedRole !== roleInfo.role) continue;
    for (const locale of locales) {
      for (const viewport of viewports) {
        if (
          retryMissing &&
          roleInfo.stages.every(stage => {
            const previous = oldByKey.get(
              shotKey(roleInfo.role, stage.slug, locale, viewport.name),
            );
            return previous?.status === 'captured' && existsSync(path.join(root, previous.path));
          })
        )
          continue;

        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          isMobile: viewport.name === 'mobile',
          locale: locale === 'ar' ? 'ar' : 'en-US',
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        try {
          await page.goto(new URL('/en/login', baseURL).href, { waitUntil: 'domcontentloaded' });
          await page.locator('input[type="email"]').fill(roleInfo.account.email);
          await page.locator('input[type="password"]').fill(fixtures.auth.password);
          await page.getByRole('button', { name: /sign in|log in/i }).click();
          await page.waitForURL(
            url => !url.pathname.endsWith('/login') && !url.pathname.includes('/admin'),
            { timeout: 20000 },
          );
          const setupPath = `/${locale}/account/setup`;
          const response = await page.goto(new URL(setupPath, baseURL).href, {
            waitUntil: 'domcontentloaded',
          });
          if (!response?.ok())
            throw new Error(`Setup route HTTP ${response?.status() ?? 'no response'}`);
          if (new URL(page.url()).pathname !== setupPath)
            throw new Error(`Unexpected setup route: ${new URL(page.url()).pathname}`);
          await page
            .getByRole('heading', { level: 1, name: titleText[locale], exact: true })
            .waitFor({ state: 'visible', timeout: 10000 });
          await goBackToFirstStage(page, roleInfo.role, locale);

          for (let stageNumber = 1; stageNumber <= roleInfo.lastStage; stageNumber++) {
            const stageInfo = roleInfo.stages[stageNumber - 1];
            const key = shotKey(roleInfo.role, stageInfo.slug, locale, viewport.name);
            const old = oldByKey.get(key);
            const alreadyCaptured =
              old?.status === 'captured' && existsSync(path.join(root, old.path));
            if (refresh || !(retryMissing && alreadyCaptured)) {
              if (roleInfo.role === 'student') await fillStudent(page, locale, stageNumber);
              else await fillTeacher(page, locale, stageNumber);
              await settle(page);
              const entry = await capturePanel(
                page,
                roleInfo,
                locale,
                viewport,
                stageInfo,
                stageNumber,
              );
              await checkpoint(entry);
              console.log(`captured ${entry.path}`);
            }
            const next = roleInfo.stages[stageNumber];
            if (next) {
              const before = await activeStage(page, locale);
              await clickWizard(
                page,
                locale,
                locale === 'ar' ? 'حفظ ومتابعة' : 'Save and continue',
              );
              await page.waitForFunction(
                previous => {
                  const list = document.querySelector(
                    'ol[aria-label="Setup progress"], ol[aria-label="مراحل الإعداد"]',
                  );
                  return (
                    list &&
                    Array.from(list.children).findIndex(
                      child => child.getAttribute('aria-current') === 'step',
                    ) +
                      1 >
                      previous
                  );
                },
                before,
                { timeout: 20000 },
              );
            }
          }

          const review = roleInfo.stages.at(-1);
          const reviewKey = shotKey(roleInfo.role, review.slug, locale, viewport.name);
          const reviewOld = oldByKey.get(reviewKey);
          const reviewAlreadyCaptured =
            reviewOld?.status === 'captured' && existsSync(path.join(root, reviewOld.path));
          if (refresh || !retryMissing || !reviewAlreadyCaptured) {
            const entry = await capturePanel(
              page,
              roleInfo,
              locale,
              viewport,
              review,
              roleInfo.lastStage + 1,
            );
            await checkpoint(entry);
            console.log(`captured ${entry.path}`);
          }

          // Leave the synthetic account at stage 1 with saved sample data so it
          // remains easy to reuse. Back never submits or completes onboarding.
          await clickWizard(page, locale, locale === 'ar' ? 'رجوع' : 'Back');
          await page.waitForFunction(
            expected => {
              const list = document.querySelector(
                'ol[aria-label="Setup progress"], ol[aria-label="مراحل الإعداد"]',
              );
              return (
                list &&
                Array.from(list.children).findIndex(
                  child => child.getAttribute('aria-current') === 'step',
                ) +
                  1 ===
                  expected
              );
            },
            roleInfo.lastStage,
            { timeout: 10000 },
          );
          await goBackToFirstStage(page, roleInfo.role, locale);
          console.log(`left ${roleInfo.role} draft at stage 1 for ${locale}/${viewport.name}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const missing = roleInfo.stages.filter(stage => {
            const existing = oldByKey.get(
              shotKey(roleInfo.role, stage.slug, locale, viewport.name),
            );
            return !(existing?.status === 'captured' && existsSync(path.join(root, existing.path)));
          });
          for (const stage of missing) {
            await checkpoint({
              path: `docs/screenshots/production/onboarding-${roleInfo.role}-${stage.slug}-${locale}-${viewport.name}.webp`,
              role: roleInfo.role,
              feature: `${roleInfo.role} onboarding · ${stage.slug}`,
              stage: stage.slug,
              stageLabel: stage.title[locale],
              logicalRoute: '/account/setup',
              locale,
              viewport: viewport.name,
              cssDimensions: { width: viewport.width, height: viewport.height },
              sourceRevision,
              actualEnvironment: 'local',
              demoProvenance:
                'Synthetic onboarding account; sample data only; no setup submission or completion.',
              capturedAt: new Date().toISOString(),
              status: 'failed',
              error: message,
            });
          }
          console.error(`failed ${roleInfo.role} ${locale} ${viewport.name}: ${message}`);
        } finally {
          await context.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}

const records = [...oldByKey.values()];
console.log(
  `Manifest records: ${records.length}; captured: ${records.filter(record => record.status === 'captured').length}; failed: ${records.filter(record => record.status === 'failed').length}.`,
);
if (records.some(record => record.status !== 'captured')) process.exitCode = 1;
