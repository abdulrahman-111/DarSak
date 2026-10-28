#!/usr/bin/env node

/**
 * Capture production UI routes from the locally running Next app.
 *
 * Usage: node scripts/screenshots/capture-web.mjs <capture-plan.json>
 * The plan is intentionally data driven so route-specific interactions and
 * heading checks stay reviewable beside the resulting manifest.
 */
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const planPath = process.argv[2];
if (!planPath) {
  console.error('Usage: node scripts/screenshots/capture-web.mjs <capture-plan.json>');
  process.exit(2);
}

const plan = JSON.parse(await fs.readFile(path.resolve(planPath), 'utf8'));
const require = createRequire(import.meta.url);
let playwrightPath = plan.playwrightPath ?? process.env.PLAYWRIGHT_CORE_PATH;
if (!playwrightPath) {
  try {
    playwrightPath = require.resolve('playwright-core');
  } catch {
    const localFallback = '/workspace/.dars-browser-tools/node_modules/playwright-core/index.mjs';
    if (
      await fs
        .access(localFallback)
        .then(() => true)
        .catch(() => false)
    )
      playwrightPath = localFallback;
  }
}
if (!playwrightPath)
  throw new Error('Set plan.playwrightPath or PLAYWRIGHT_CORE_PATH to a Playwright Core module.');
const { chromium } = await import(pathToFileURL(path.resolve(playwrightPath)).href);
const baseURL = plan.baseURL ?? 'http://localhost:3081';
const outputRoot = path.resolve(plan.outputRoot ?? 'docs/screenshots/production');
const manifestPath = path.resolve(
  plan.manifestPath ?? 'docs/screenshots/production/web-captures.json',
);
const sourceRevision = plan.sourceRevision ?? 'unknown';
const viewports = plan.viewports ?? [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
const capturedAt = new Date().toISOString();
const results = [];
// Keep authenticated demo sessions in memory for this run only. The state is
// never written to the manifest or a workspace file.
const authStorageStates = new Map();

function record(route, locale, viewport, status, details = {}) {
  results.push({
    path: `docs/screenshots/production/${route.category}/${route.slug}-${locale}-${viewport.name}.webp`,
    role: route.role,
    logicalRoute: route.logicalRoute,
    feature: route.feature,
    ...(route.provenance ? { provenance: route.provenance } : {}),
    locale,
    viewport: viewport.name,
    mobileEmulation: viewport.isMobile ?? viewport.name === 'mobile',
    dimensions: { width: viewport.width, height: viewport.height },
    sourceRevision,
    capturedAt,
    actualEnvironment: 'local',
    status,
    ...details,
  });
}

async function runAction(page, action) {
  if (action.type === 'click') {
    const locator = page.getByRole(action.role ?? 'button', {
      name: action.name,
      exact: action.exact ?? true,
    });
    await locator.first().click({ timeout: action.timeout ?? 8000 });
  } else if (action.type === 'fill') {
    await page.getByLabel(action.label, { exact: action.exact ?? true }).fill(action.value);
  } else if (action.type === 'fillSelector') {
    await page
      .locator(action.selector)
      .nth(action.index ?? 0)
      .fill(action.value);
  } else if (action.type === 'clickSelector') {
    await page
      .locator(action.selector)
      .nth(action.index ?? 0)
      .click({ timeout: action.timeout ?? 8000 });
  } else if (action.type === 'pressSelector') {
    await page
      .locator(action.selector)
      .nth(action.index ?? 0)
      .press(action.key);
  } else if (action.type === 'select') {
    await page.getByLabel(action.label, { exact: action.exact ?? true }).selectOption(action.value);
  } else if (action.type === 'check') {
    await page.getByLabel(action.label, { exact: action.exact ?? true }).check();
  } else if (action.type === 'wait') {
    await page.waitForTimeout(action.ms ?? 500);
  } else if (action.type === 'expectText') {
    await page
      .getByText(action.text, { exact: action.exact ?? false })
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
  } else if (action.type === 'expectVisible') {
    await page
      .locator(action.selector)
      .waitFor({ state: 'visible', timeout: action.timeout ?? 10000 });
  } else if (action.type === 'navigate') {
    await page.goto(new URL(action.path, baseURL).href, { waitUntil: 'domcontentloaded' });
  } else {
    throw new Error(`Unsupported action type: ${action.type}`);
  }
}

let executablePath = plan.executablePath ?? process.env.CHROMIUM_EXECUTABLE;
if (!executablePath) {
  const detected = spawnSync('which', ['chromium'], { encoding: 'utf8' });
  executablePath = detected.status === 0 ? detected.stdout.trim() : undefined;
}
const launchOptions = { headless: true, args: ['--no-sandbox'] };
if (executablePath) launchOptions.executablePath = executablePath;
const browser = await chromium.launch(launchOptions);
try {
  for (const route of plan.routes) {
    for (const locale of route.locales ?? ['en', 'ar']) {
      for (const viewport of route.viewports ?? viewports) {
        const relative = `/${locale}${route.path}`;
        const targetPath = relative.replace(/\/$/, '') || `/${locale}`;
        const storageState = route.auth?.storageStateFile
          ? JSON.parse(await fs.readFile(route.auth.storageStateFile, 'utf8'))
          : route.auth?.email
            ? authStorageStates.get(route.auth.email)
            : undefined;
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          isMobile: viewport.isMobile ?? viewport.name === 'mobile',
          locale: viewport.browserLocale ?? (locale === 'ar' ? 'ar' : 'en-US'),
          reducedMotion: 'reduce',
          ...(storageState ? { storageState } : {}),
        });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('pageerror', error => consoleErrors.push(error.message));
        let outputPath = path.join(
          outputRoot,
          route.category,
          `${route.slug}-${locale}-${viewport.name}.webp`,
        );
        try {
          const targetURL = new URL(targetPath, baseURL);
          if (route.auth && !storageState) {
            // Stable input selectors work in both locales. Keep the login locale
            // aligned with the requested route, and wait for an authenticated
            // landing path rather than accepting the login page itself.
            await page.goto(new URL(`/${locale}/login`, baseURL).href, {
              waitUntil: 'domcontentloaded',
            });
            await page.locator('input[type="email"]').fill(route.auth.email);
            await page.locator('input[type="password"]').fill(route.auth.password);
            const loginForm = page
              .locator('form')
              .filter({ has: page.locator('input[type="email"]') });
            await loginForm.locator('button[type="submit"]').click();
            const landingPath = route.auth.landingPath ?? `/${locale}/${route.role}`;
            await page.waitForURL(
              url => url.pathname === landingPath || url.pathname === targetURL.pathname,
              { timeout: 20000 },
            );
            authStorageStates.set(route.auth.email, await context.storageState());
          }
          const response = await page.goto(targetURL.href, { waitUntil: 'domcontentloaded' });
          if (!response || !response.ok())
            throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
          if (route.actions) for (const action of route.actions) await runAction(page, action);
          const heading = route.expectedHeading;
          if (heading)
            await page
              .getByRole('heading', { name: heading, exact: route.exactHeading ?? true })
              .first()
              .waitFor({ state: 'visible', timeout: 12000 });
          else await page.locator('h1').first().waitFor({ state: 'visible', timeout: 12000 });
          await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
          await page.evaluate(async () => {
            if (document.fonts?.ready) await document.fonts.ready;
            await new Promise(resolve =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
          const finalURL = new URL(page.url());
          if (finalURL.pathname.includes('/admin'))
            throw new Error('Refusing to capture an admin URL');
          if (finalURL.pathname !== targetURL.pathname)
            throw new Error(`Unexpected final path: ${finalURL.pathname}`);
          const bodyText = await page.locator('body').innerText();
          if (!bodyText.trim()) throw new Error('Page body is empty');
          const visibleHeading = (await page.locator('h1:visible').first().innerText()).trim();
          if (/something went wrong|internal server error|application error/i.test(bodyText))
            throw new Error('Visible application error state');
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await page.screenshot({
            path: outputPath,
            type: 'webp',
            quality: 78,
            fullPage: true,
            animations: 'disabled',
            style: 'nextjs-portal { display: none !important; }',
          });
          record(route, locale, viewport, 'captured', {
            finalURL: `${finalURL.pathname}${finalURL.search}`,
            expectedHeading: heading ?? visibleHeading,
            consoleErrors,
          });
          console.log(`captured ${route.slug} ${locale} ${viewport.name}`);
        } catch (error) {
          await fs.rm(outputPath, { force: true }).catch(() => {});
          record(route, locale, viewport, 'failed', {
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
  }
} finally {
  await browser.close();
}

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
const existing = await fs
  .readFile(manifestPath, 'utf8')
  .then(value => JSON.parse(value))
  .catch(() => []);
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
console.log(`Wrote ${results.length} capture records to ${manifestPath}`);
if (results.some(result => result.status === 'failed')) process.exitCode = 1;
