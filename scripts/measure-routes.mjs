#!/usr/bin/env node

// Ten cold Playwright samples per allowlisted route. No page artifacts are recorded.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const THROTTLE = Object.freeze({
  profile: 'fast4g-cpu4-v1',
  latencyMs: 40,
  downloadBytesPerSecond: 4_000_000 / 8,
  uploadBytesPerSecond: 1_000_000 / 8,
  cpuRate: 4,
  viewport: { width: 390, height: 844 },
  observationWindowMs: 5_000,
  timeoutMs: 20_000,
  samplesPerRoute: 10,
});

export const ROUTES = Object.freeze({
  'landing-en': { template: '/en', locale: 'en-US', access: 'public' },
  'landing-ar': { template: '/ar', locale: 'ar-EG', access: 'public' },
  'teachers-en': { template: '/en/teachers', locale: 'en-US', access: 'public' },
  'teachers-ar': { template: '/ar/teachers', locale: 'ar-EG', access: 'public' },
  'student-en': { template: '/en/student', locale: 'en-US', access: 'private', role: 'student' },
  'student-ar': { template: '/ar/student', locale: 'ar-EG', access: 'private', role: 'student' },
  'teacher-en': { template: '/en/teacher', locale: 'en-US', access: 'private', role: 'teacher' },
  'teacher-ar': { template: '/ar/teacher', locale: 'ar-EG', access: 'private', role: 'teacher' },
});

const HOSTED_ORIGINS = Object.freeze({
  production: 'https://darsak-platform.vercel.app',
  staging: 'https://darsak-platform-staging.vercel.app',
});

function loopback(host) {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return true;
  const parts = normalized.split('.').map(Number);
  return parts.length === 4 && parts[0] === 127 && parts.every(n => n >= 0 && n <= 255);
}

export function validateTarget(value, environment) {
  if (!['local', 'staging', 'production'].includes(environment))
    throw new Error('Environment must be local, staging, or production.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Base URL must be an absolute HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Base URL must use HTTP(S) and contain no credentials.');
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error('Base URL must contain only an origin.');
  if (environment === 'local') {
    if (!loopback(url.hostname)) throw new Error('Local measurements require a loopback origin.');
  } else if (url.origin !== HOSTED_ORIGINS[environment]) {
    throw new Error(`Base URL is not in the ${environment} origin allowlist.`);
  }
  return { origin: url.origin, environment };
}

export function validatePrivateStateUse({ environment, hasState, syntheticStaging }) {
  if (!hasState) return true;
  if (environment === 'production') throw new Error('Production private state is prohibited.');
  if (environment === 'staging' && !syntheticStaging)
    throw new Error('Private staging state must be declared synthetic staging state.');
  if (!['local', 'staging'].includes(environment))
    throw new Error('Private state is allowed only on loopback or synthetic staging.');
  return true;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function nearestRankP90(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)];
}

export function summarizeSamples(samples) {
  const metricKeys = ['ttfbMs', 'fcpMs', 'lcpMs'];
  const errors = [];
  samples.forEach((sample, index) => {
    if (sample.error)
      errors.push({ sample: index, status: sample.status ?? null, error: sample.error });
    if (sample.status !== 200) {
      if (!sample.error)
        errors.push({ sample: index, status: sample.status ?? null, error: 'http-status' });
    }
    for (const metric of metricKeys) {
      if (!Number.isFinite(sample[metric]) || sample[metric] < 0)
        errors.push({ sample: index, metric, error: 'missing' });
    }
  });
  const metrics = Object.fromEntries(
    [...metricKeys, 'serverTimingMs'].map(metric => {
      const values = samples
        .map(sample => sample[metric])
        .filter(value => Number.isFinite(value) && value >= 0);
      return [
        metric,
        values.length
          ? { count: values.length, median: median(values), p90: nearestRankP90(values) }
          : { count: 0, median: null, p90: null },
      ];
    }),
  );
  return {
    sampleCount: samples.length,
    complete: samples.length === THROTTLE.samplesPerRoute && errors.length === 0,
    metrics,
    errors,
  };
}

export function sanitizeSample(sample) {
  return {
    status: Number.isInteger(sample.status) ? sample.status : null,
    ttfbMs: Number.isFinite(sample.ttfbMs) ? sample.ttfbMs : null,
    fcpMs: Number.isFinite(sample.fcpMs) ? sample.fcpMs : null,
    lcpMs: Number.isFinite(sample.lcpMs) ? sample.lcpMs : null,
    serverTimingMs: Number.isFinite(sample.serverTimingMs) ? sample.serverTimingMs : null,
    ...(sample.error
      ? {
          error: ['redirected', 'timeout', 'navigation', 'http-status'].includes(sample.error)
            ? sample.error
            : 'navigation',
        }
      : {}),
  };
}

export function parseServerTiming(header) {
  if (!header) return null;
  const durations = [...header.matchAll(/(?:^|,)\s*[a-z][a-z0-9_-]*\s*;\s*dur=(\d+(?:\.\d+)?)/gi)]
    .map(match => Number(match[1]))
    .filter(Number.isFinite);
  return durations.length ? durations.reduce((sum, value) => sum + value, 0) : null;
}

function parseArgs(argv) {
  const values = {};
  const routes = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--route') {
      if (!argv[i + 1]) throw new Error('--route requires an allowlisted route name.');
      routes.push(argv[++i]);
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (['synthetic-staging-state', 'warm-public'].includes(key)) values[key] = true;
      else {
        if (!argv[i + 1] || argv[i + 1].startsWith('--'))
          throw new Error(`${arg} requires a value.`);
        values[key] = argv[++i];
      }
    } else throw new Error(`Unexpected argument: ${arg}`);
  }
  values.routes = routes.length
    ? routes
    : Object.keys(ROUTES).filter(name => ROUTES[name].access === 'public');
  return values;
}

async function readPrivateState(file) {
  if (!file) return undefined;
  const absolute = path.resolve(file);
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0)
    throw new Error('Private state must be a regular file with owner-only permissions.');
  return absolute;
}

export function resolveBuildIdentity({ environment, buildSha, deploymentId, gitSha }) {
  if (environment !== 'local' && (!buildSha || !deploymentId))
    throw new Error('Hosted measurements require an exact hosted build SHA and deployment ID.');
  buildSha = buildSha ?? gitSha;
  if (!/^[a-f0-9]{40,64}$/.test(buildSha ?? ''))
    throw new Error('Pass an exact 40-64 character --build-sha.');
  deploymentId = deploymentId ?? `local-${buildSha.slice(0, 12)}`;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(deploymentId))
    throw new Error('Deployment identity contains unsupported characters.');
  return { buildSha, deploymentId };
}

async function outputDirectory(value) {
  const dir = value
    ? path.resolve(value)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'darsak-route-measure-'));
  if (value) await fs.mkdir(dir, { mode: 0o700 });
  await fs.chmod(dir, 0o700);
  return dir;
}

export function routeFromFinalUrl(url, origin) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== origin) return null;
    const pathOnly = parsed.pathname.replace(/\/$/, '') || '/';
    return Object.entries(ROUTES).find(([, route]) => route.template === pathOnly)?.[0] ?? null;
  } catch {
    return null;
  }
}

async function oneSample(browser, target, routeName, statePath, warm = false) {
  const route = ROUTES[routeName];
  const context = await browser.newContext({
    viewport: THROTTLE.viewport,
    locale: route.locale,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    ...(statePath ? { storageState: statePath } : {}),
  });
  const page = await context.newPage();
  let cdp;
  if (!warm) {
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: THROTTLE.latencyMs,
      downloadThroughput: THROTTLE.downloadBytesPerSecond,
      uploadThroughput: THROTTLE.uploadBytesPerSecond,
      connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE.cpuRate });
  }
  await page.addInitScript(() => {
    window.__routeMetrics = { lcp: null };
    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length) window.__routeMetrics.lcp = entries.at(-1).startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  });
  let response = null;
  let error = null;
  try {
    response = await page.goto(new URL(route.template, target.origin).href, {
      waitUntil: 'domcontentloaded',
      timeout: THROTTLE.timeoutMs,
    });
    await page.waitForTimeout(THROTTLE.observationWindowMs);
  } catch (cause) {
    error = String(cause).includes('Timeout') ? 'timeout' : 'navigation';
  }
  let measured = {};
  try {
    measured = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const fcp = performance
        .getEntriesByName('first-contentful-paint')
        .find(entry => entry.entryType === 'paint');
      return {
        ttfbMs: navigation ? navigation.responseStart - navigation.requestStart : null,
        fcpMs: fcp?.startTime ?? null,
        lcpMs: window.__routeMetrics?.lcp ?? null,
      };
    });
  } catch {}
  const status = response?.status() ?? null;
  const actualRoute = routeFromFinalUrl(page.url(), target.origin);
  if (!error && actualRoute !== routeName) error = 'redirected';
  if (!error && status !== 200) error = 'http-status';
  const sample = sanitizeSample({
    status,
    ...measured,
    serverTimingMs: parseServerTiming(
      await response?.headerValue('server-timing').catch(() => null),
    ),
    error,
  });
  const cacheHeader = await response?.headerValue('x-vercel-cache').catch(() => null);
  await context.close();
  return warm
    ? {
        status,
        cache: ['HIT', 'MISS', 'STALE', 'PRERENDER', 'BYPASS'].includes(cacheHeader)
          ? cacheHeader
          : 'unknown',
      }
    : sample;
}

async function writeOutput(dir, data) {
  await fs.writeFile(
    path.join(dir, 'route-measurements.json'),
    `${JSON.stringify(data, null, 2)}\n`,
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const environment = args.environment ?? 'local';
  const target = validateTarget(args['base-url'], environment);
  const studentState = await readPrivateState(args['student-state']);
  const teacherState = await readPrivateState(args['teacher-state']);
  const hasState = Boolean(studentState || teacherState);
  validatePrivateStateUse({
    environment,
    hasState,
    syntheticStaging: Boolean(args['synthetic-staging-state']),
  });
  const selected = args.routes;
  for (const name of selected)
    if (!ROUTES[name]) throw new Error(`Unknown route template: ${name}`);
  for (const name of selected) {
    const route = ROUTES[name];
    if (
      route.access === 'private' &&
      !((route.role === 'student' && studentState) || (route.role === 'teacher' && teacherState))
    )
      throw new Error(`Private route ${name} requires its matching local or synthetic state file.`);
  }
  if (args['synthetic-staging-state'] && environment !== 'staging')
    throw new Error('--synthetic-staging-state is valid only for the staging environment.');

  const output = await outputDirectory(args.output);
  const gitSha =
    environment === 'local'
      ? spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim()
      : undefined;
  const identity = resolveBuildIdentity({
    environment,
    buildSha: args['build-sha'] ?? process.env.VERCEL_GIT_COMMIT_SHA,
    deploymentId: args['deployment-id'],
    gitSha,
  });
  const { chromium } = createRequire(import.meta.url)('@playwright/test');
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
    headless: true,
  });
  const report = {
    capturedAt: new Date().toISOString(),
    environment,
    origin: target.origin,
    deploymentId: identity.deploymentId,
    buildSha: identity.buildSha,
    observationWindowMs: THROTTLE.observationWindowMs,
    throttle: THROTTLE,
    routes: {},
    warmChecks: {},
  };
  try {
    for (const name of selected) {
      const state =
        ROUTES[name].role === 'student'
          ? studentState
          : ROUTES[name].role === 'teacher'
            ? teacherState
            : undefined;
      const samples = [];
      for (let i = 0; i < THROTTLE.samplesPerRoute; i++) {
        try {
          samples.push(await oneSample(browser, target, name, state));
        } catch {
          samples.push(sanitizeSample({ error: 'navigation' }));
        }
      }
      report.routes[name] = {
        template: ROUTES[name].template,
        access: ROUTES[name].access,
        sampleCount: samples.length,
        summary: summarizeSamples(samples),
        samples,
      };
      if (args['warm-public'] && ROUTES[name].access === 'public')
        report.warmChecks[name] = await oneSample(browser, target, name, undefined, true);
    }
  } finally {
    await browser.close();
  }
  await writeOutput(output, report);
  console.log(`Wrote sanitized route measurements to ${output}`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
