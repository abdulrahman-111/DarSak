#!/usr/bin/env node

// Capture font requests and basic visual stability on loopback routes.
// Usage: node scripts/measure-font-payload.mjs --base-url http://127.0.0.1:3000
// Optional authenticated captures: --student-state PATH --teacher-state PATH
// State files are read only and are never copied into output.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--'))
      pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return pairs;
  }, []),
);
const baseURL = args['base-url'];
if (!baseURL) throw new Error('Pass --base-url with a loopback URL.');
const origin = new URL(baseURL);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
  throw new Error('Base URL must use HTTP(S) and contain no credentials.');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
  throw new Error('Only loopback base URLs are allowed.');
const outputDir = path.resolve(args.output ?? '/tmp/dars-roadmap-work/font-measurements');
const { chromium } = require('@playwright/test');
const routes = [
  { name: 'landing-en-desktop', route: '/en', width: 1280, height: 900, locale: 'en-US' },
  { name: 'landing-ar-desktop', route: '/ar', width: 1280, height: 900, locale: 'ar-EG' },
  {
    name: 'landing-en-mobile',
    route: '/en',
    width: 390,
    height: 844,
    locale: 'en-US',
    mobile: true,
  },
  {
    name: 'landing-ar-mobile',
    route: '/ar',
    width: 390,
    height: 844,
    locale: 'ar-EG',
    mobile: true,
  },
  {
    name: 'student-dashboard-en-desktop',
    route: '/en/student',
    state: args['student-state'],
    width: 1280,
    height: 900,
    locale: 'en-US',
  },
  {
    name: 'student-dashboard-en-mobile',
    route: '/en/student',
    state: args['student-state'],
    width: 390,
    height: 844,
    locale: 'en-US',
    mobile: true,
  },
  {
    name: 'teacher-dashboard-en-desktop',
    route: '/en/teacher',
    state: args['teacher-state'],
    width: 1280,
    height: 900,
    locale: 'en-US',
  },
  {
    name: 'teacher-dashboard-en-mobile',
    route: '/en/teacher',
    state: args['teacher-state'],
    width: 390,
    height: 844,
    locale: 'en-US',
    mobile: true,
  },
  {
    name: 'student-dashboard-ar-desktop',
    route: '/ar/student',
    state: args['student-state'],
    width: 1280,
    height: 900,
    locale: 'ar-EG',
  },
  {
    name: 'student-dashboard-ar-mobile',
    route: '/ar/student',
    state: args['student-state'],
    width: 390,
    height: 844,
    locale: 'ar-EG',
    mobile: true,
  },
  {
    name: 'teacher-dashboard-ar-desktop',
    route: '/ar/teacher',
    state: args['teacher-state'],
    width: 1280,
    height: 900,
    locale: 'ar-EG',
  },
  {
    name: 'teacher-dashboard-ar-mobile',
    route: '/ar/teacher',
    state: args['teacher-state'],
    width: 390,
    height: 844,
    locale: 'ar-EG',
    mobile: true,
  },
];
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  ...((args.browser ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
    ? { executablePath: args.browser ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  headless: true,
});
const results = [];
try {
  for (const route of routes) {
    const context = await browser.newContext({
      viewport: { width: route.width, height: route.height },
      locale: route.locale,
      ...(route.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
      ...(route.state ? { storageState: path.resolve(route.state) } : {}),
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
      connectionType: 'cellular3g',
    });
    const requests = new Map();
    const fonts = new Map();
    cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, event.request.url));
    cdp.on('Network.loadingFinished', event => {
      const url = requests.get(event.requestId);
      if (url && /\.(woff2?|ttf|otf)(?:\?|$)/i.test(new URL(url).pathname)) {
        const item = fonts.get(url) ?? {
          url: new URL(url).pathname.split('/').at(-1),
          encodedTransferBytes: 0,
        };
        item.encodedTransferBytes = event.encodedDataLength;
        fonts.set(url, item);
      }
    });
    await page.addInitScript(() => {
      window.__fontMeasure = { cls: 0 };
      new PerformanceObserver(list => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) window.__fontMeasure.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    let navigationError;
    let navigationResponse;
    try {
      navigationResponse = await page.goto(new URL(route.route, origin).href, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
    } catch (error) {
      navigationError = String(error).slice(0, 240);
    }
    const details = await page
      .evaluate(() => ({
        title: document.title,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        documentHeight: document.documentElement.scrollHeight,
        fontsStatus: document.fonts.status,
        cls: window.__fontMeasure?.cls ?? null,
        fontResources: performance
          .getEntriesByType('resource')
          .filter(e => /\.(woff2?|ttf|otf)(?:\?|$)/i.test(new URL(e.name).pathname))
          .map(e => ({
            basename: new URL(e.name).pathname.split('/').at(-1),
            encodedBodyBytes: e.encodedBodySize || null,
            decodedBodyBytes: e.decodedBodySize || null,
          })),
      }))
      .catch(() => ({}));
    const fontResponses = [...fonts.values()];
    await page
      .screenshot({ path: path.join(outputDir, `${route.name}.png`), fullPage: true })
      .catch(() => {});
    results.push({
      route: route.name,
      path: route.route,
      finalPath: (() => {
        try {
          return new URL(page.url()).pathname;
        } catch {
          return null;
        }
      })(),
      navigationStatus: navigationResponse?.status() ?? null,
      viewport: { width: route.width, height: route.height },
      authStateProvided: Boolean(route.state),
      ...(navigationError ? { navigationError } : {}),
      ...details,
      fontRequests: fontResponses,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  path.join(outputDir, 'measurements.json'),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      baseOrigin: origin.origin,
      throttle: { latencyMs: 150, downloadKbps: 1600, uploadKbps: 750 },
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Wrote ${results.length} route measurements to ${outputDir}`);
