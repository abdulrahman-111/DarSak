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
  staging: 'https://darsak-staging-theag01s-projects.vercel.app',
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
    throw new Error(
      'Private staging state requires operator assertion of synthetic staging fixtures.',
    );
  if (!['local', 'staging'].includes(environment))
    throw new Error('Private state is allowed only on loopback or synthetic staging.');
  return true;
}

export function validateStateOrigins(state, target) {
  const cookies = Array.isArray(state?.cookies) ? state.cookies : [];
  const origins = Array.isArray(state?.origins) ? state.origins : [];
  const allowedDomain = domain => {
    const normalized = String(domain ?? '')
      .replace(/^\./, '')
      .toLowerCase();
    if (target.environment === 'local') return loopback(normalized);
    return normalized === new URL(target.origin).hostname.toLowerCase();
  };
  for (const cookie of cookies) {
    if (!allowedDomain(cookie.domain))
      throw new Error(
        'Private browser state contains a cookie outside the selected origin boundary.',
      );
  }
  for (const entry of origins) {
    let parsed;
    try {
      parsed = new URL(entry.origin);
    } catch {
      throw new Error('Private browser state contains an invalid origin.');
    }
    const allowed =
      target.environment === 'local'
        ? ['http:', 'https:'].includes(parsed.protocol) && loopback(parsed.hostname)
        : parsed.origin === target.origin;
    if (!allowed)
      throw new Error(
        'Private browser state contains an origin outside the selected origin boundary.',
      );
  }
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
  const validSamples = samples.filter(
    sample => sample.valid === true && sample.status === 200 && !sample.error,
  );
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
  const metricMissingCounts = Object.fromEntries(
    metricKeys.map(metric => [
      metric,
      samples.filter(sample => !Number.isFinite(sample[metric]) || sample[metric] < 0).length,
    ]),
  );
  const metrics = Object.fromEntries(
    metricKeys.map(metric => {
      const values = validSamples
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
    validSampleCount: validSamples.length,
    excludedSampleCount: samples.length - validSamples.length,
    metricMissingCounts,
    complete:
      samples.length === THROTTLE.samplesPerRoute &&
      validSamples.length === THROTTLE.samplesPerRoute &&
      errors.length === 0 &&
      metricKeys.every(metric => metrics[metric].count === THROTTLE.samplesPerRoute),
    metrics,
    errors,
  };
}

const SAFE_ERRORS = [
  'redirected',
  'timeout',
  'navigation',
  'http-status',
  'external-navigation-blocked',
  'document-changed',
];

function sanitizeServerTiming(entries) {
  if (!Array.isArray(entries)) return null;
  const bounded = entries
    .filter(
      entry =>
        entry &&
        ['app', 'db', 'edge'].includes(entry.name) &&
        Number.isFinite(entry.durationMs) &&
        entry.durationMs >= 0,
    )
    .slice(0, 3)
    .map(entry => ({ name: entry.name, durationMs: entry.durationMs }));
  return bounded.length ? bounded : null;
}

export function sanitizeSample(sample) {
  return {
    valid: sample.valid === true,
    status: Number.isInteger(sample.status) ? sample.status : null,
    ttfbMs: Number.isFinite(sample.ttfbMs) ? sample.ttfbMs : null,
    fcpMs: Number.isFinite(sample.fcpMs) ? sample.fcpMs : null,
    lcpMs: Number.isFinite(sample.lcpMs) ? sample.lcpMs : null,
    serverTiming: sanitizeServerTiming(sample.serverTiming),
    ...(sample.error
      ? {
          error: SAFE_ERRORS.includes(sample.error) ? sample.error : 'navigation',
        }
      : {}),
  };
}

export function parseServerTiming(header) {
  if (!header) return null;
  const segments = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < header.length; i++) {
    const character = header[i];
    if (escaped) {
      escaped = false;
    } else if (character === '\\' && quoted) {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      segments.push(header.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(header.slice(start));
  const entries = [];
  for (const segment of segments) {
    const match = /^\s*([a-z][a-z0-9_-]*)\s*;(.+)$/i.exec(segment);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if (!['app', 'db', 'edge'].includes(name)) continue;
    const duration = /(?:^|;)\s*dur\s*=\s*(\d+(?:\.\d+)?)\s*(?=;|$)/i.exec(match[2]);
    if (!duration) continue;
    const durationMs = Number(duration[1]);
    if (Number.isFinite(durationMs) && durationMs >= 0) entries.push({ name, durationMs });
  }
  return sanitizeServerTiming(entries);
}

export function navigationTtfbMs(navigation) {
  const { responseStart, activationStart, startTime } = navigation ?? {};
  if (!Number.isFinite(responseStart) || responseStart <= 0) return null;
  const origin =
    Number.isFinite(activationStart) && activationStart > 0 ? activationStart : startTime;
  if (!Number.isFinite(origin) || origin < 0 || responseStart < origin) return null;
  return responseStart - origin;
}

export function classifyDocumentAttempt(attempt) {
  if (attempt.externalNavigationBlocked)
    return { valid: false, error: 'external-navigation-blocked' };
  if (attempt.status !== 200) return { valid: false, error: 'http-status' };
  if ((attempt.redirectedFromUrls ?? []).length > 0) return { valid: false, error: 'redirected' };
  const urls = [
    attempt.responseUrl,
    attempt.initialUrl,
    attempt.finalUrl,
    ...(attempt.redirectedFromUrls ?? []),
  ];
  if (urls.some(url => routeFromFinalUrl(url, attempt.origin) !== attempt.expectedRoute))
    return { valid: false, error: 'redirected' };
  if (
    !Array.isArray(attempt.mainFrameRoutes) ||
    attempt.mainFrameRoutes.length === 0 ||
    attempt.mainFrameRoutes.some(route => route !== attempt.expectedRoute)
  )
    return { valid: false, error: 'redirected' };
  if (
    !Number.isFinite(attempt.initialTimeOrigin) ||
    !Number.isFinite(attempt.finalTimeOrigin) ||
    attempt.initialTimeOrigin !== attempt.finalTimeOrigin
  )
    return { valid: false, error: 'document-changed' };
  return { valid: true, error: null };
}

export function classifyWarmCheck(attempt, cacheHeader) {
  const valid = attempt.valid === true && attempt.status === 200 && !attempt.error;
  return {
    valid,
    status: Number.isInteger(attempt.status) ? attempt.status : null,
    error: valid ? null : (attempt.error ?? 'http-status'),
    cache:
      valid && ['HIT', 'MISS', 'STALE', 'PRERENDER', 'BYPASS'].includes(cacheHeader)
        ? cacheHeader
        : 'unknown',
  };
}

export function redirectedFromUrls(request) {
  const urls = [];
  for (let previous = request?.redirectedFrom(); previous; previous = previous.redirectedFrom())
    urls.push(previous.url());
  return urls;
}

export async function installMainFrameOriginGuard(cdp, origin, mainFrameId, onBlocked = () => {}) {
  const onPaused = async event => {
    const isMainDocument = event.resourceType === 'Document' && event.frameId === mainFrameId;
    let forbidden = false;
    if (isMainDocument) {
      try {
        forbidden = new URL(event.request.url).origin !== origin;
      } catch {
        forbidden = true;
      }
    }
    try {
      if (forbidden) {
        onBlocked();
        await cdp.send('Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'BlockedByClient',
        });
      } else {
        await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
      }
    } catch {
      // A paused request must always be released, including when one CDP command fails.
      try {
        await cdp.send('Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'Aborted',
        });
      } catch {}
    }
  };
  cdp.on('Fetch.requestPaused', onPaused);
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }],
  });
  return async () => {
    cdp.off('Fetch.requestPaused', onPaused);
    await cdp.send('Fetch.disable');
  };
}

export function parseArgs(argv) {
  const values = {};
  const routes = [];
  const valueOptions = new Set([
    'environment',
    'base-url',
    'build-sha',
    'deployment-id',
    'student-state',
    'teacher-state',
    'output',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--route') {
      if (!argv[i + 1]) throw new Error('--route requires an allowlisted route name.');
      routes.push(argv[++i]);
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (['synthetic-staging-state', 'warm-public'].includes(key)) values[key] = true;
      else if (valueOptions.has(key)) {
        if (!argv[i + 1] || argv[i + 1].startsWith('--'))
          throw new Error(`${arg} requires a value.`);
        values[key] = argv[++i];
      } else throw new Error(`Unknown option: ${arg}`);
    } else throw new Error(`Unexpected argument: ${arg}`);
  }
  values.routes = routes.length
    ? routes
    : Object.keys(ROUTES).filter(name => ROUTES[name].access === 'public');
  return values;
}

async function readPrivateState(file, target) {
  if (!file) return undefined;
  const absolute = path.resolve(file);
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0)
    throw new Error('Private state must be a regular file with owner-only permissions.');
  let state;
  try {
    state = JSON.parse(await fs.readFile(absolute, 'utf8'));
  } catch {
    throw new Error('Private browser state must be valid Playwright storage state JSON.');
  }
  validateStateOrigins(state, target);
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
  let dir;
  if (value) {
    dir = path.resolve(value);
    const parent = await fs.stat(path.dirname(dir));
    if (!parent.isDirectory() || (parent.mode & 0o022) !== 0)
      throw new Error('Output parent must be a directory not writable by untrusted users.');
    try {
      await fs.lstat(dir);
      throw new Error('Output directory must not already exist.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.mkdir(dir, { mode: 0o700 });
  } else dir = await fs.mkdtemp(path.join(os.tmpdir(), 'darsak-route-measure-'));
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
    serviceWorkers: 'block',
    ...(statePath ? { storageState: statePath } : {}),
  });
  try {
    const page = await context.newPage();
    const mainFrameRoutes = [];
    let externalNavigationBlocked = false;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame())
        mainFrameRoutes.push(routeFromFinalUrl(frame.url(), target.origin));
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const { frameTree } = await cdp.send('Page.getFrameTree');
    await cdp.send('Network.enable');
    if (!warm) {
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
    await installMainFrameOriginGuard(cdp, target.origin, frameTree.frame.id, () => {
      externalNavigationBlocked = true;
    });
    await page.addInitScript(() => {
      window.__routeMetrics = { lcp: null, observer: null };
      try {
        window.__routeMetrics.observer = new PerformanceObserver(list => {
          const entries = list.getEntries();
          if (entries.length) window.__routeMetrics.lcp = entries.at(-1).startTime;
        });
        window.__routeMetrics.observer.observe({
          type: 'largest-contentful-paint',
          buffered: true,
        });
      } catch {}
    });
    let response = null;
    let navigationError = null;
    let initialDocument;
    try {
      response = await page.goto(new URL(route.template, target.origin).href, {
        waitUntil: 'domcontentloaded',
        timeout: THROTTLE.timeoutMs,
      });
      initialDocument = await page.evaluate(() => ({
        url: location.href,
        timeOrigin: performance.timeOrigin,
      }));
      await page.waitForTimeout(THROTTLE.observationWindowMs);
    } catch (cause) {
      navigationError = String(cause).includes('Timeout') ? 'timeout' : 'navigation';
    }
    let measured = {};
    let finalDocument = {};
    try {
      const result = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const fcp = performance
          .getEntriesByName('first-contentful-paint')
          .find(entry => entry.entryType === 'paint');
        const observer = window.__routeMetrics?.observer;
        const pending = observer?.takeRecords() ?? [];
        if (pending.length) window.__routeMetrics.lcp = pending.at(-1).startTime;
        return {
          url: location.href,
          timeOrigin: performance.timeOrigin,
          navigation: navigation
            ? {
                responseStart: navigation.responseStart,
                activationStart: navigation.activationStart,
                startTime: navigation.startTime,
              }
            : null,
          fcpMs: fcp?.startTime ?? null,
          lcpMs: window.__routeMetrics?.lcp ?? null,
        };
      });
      finalDocument = { url: result.url, timeOrigin: result.timeOrigin };
      measured = {
        ttfbMs: navigationTtfbMs(result.navigation),
        fcpMs: result.fcpMs,
        lcpMs: result.lcpMs,
      };
    } catch {}
    const status = response?.status() ?? null;
    const redirectedUrls = redirectedFromUrls(response?.request());
    const finalUrl = finalDocument.url ?? page.url();
    const attempt = classifyDocumentAttempt({
      origin: target.origin,
      expectedRoute: routeName,
      status,
      responseUrl: response?.url() ?? '',
      initialUrl: initialDocument?.url ?? page.url(),
      finalUrl,
      initialTimeOrigin: initialDocument?.timeOrigin,
      finalTimeOrigin: finalDocument.timeOrigin,
      mainFrameRoutes,
      redirectedFromUrls: redirectedUrls,
      externalNavigationBlocked,
    });
    const error = externalNavigationBlocked
      ? 'external-navigation-blocked'
      : (navigationError ?? attempt.error);
    const serverTiming = parseServerTiming(
      await response?.headerValue('server-timing').catch(() => null),
    );
    const cacheHeader = await response?.headerValue('x-vercel-cache').catch(() => null);
    const sample = sanitizeSample({
      valid: !error && attempt.valid,
      status,
      ...measured,
      serverTiming,
      error,
    });
    return warm ? classifyWarmCheck({ valid: sample.valid, status, error }, cacheHeader) : sample;
  } finally {
    await context.close();
  }
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
  const hasState = Boolean(args['student-state'] || args['teacher-state']);
  validatePrivateStateUse({
    environment,
    hasState,
    syntheticStaging: Boolean(args['synthetic-staging-state']),
  });
  if (args['synthetic-staging-state'] && environment !== 'staging')
    throw new Error('--synthetic-staging-state is valid only for the staging environment.');
  const studentState = await readPrivateState(args['student-state'], target);
  const teacherState = await readPrivateState(args['teacher-state'], target);
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
  const runStartedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    runStartedAt,
    capturedAt: new Date().toISOString(),
    browserVersion: browser.version(),
    environment,
    origin: target.origin,
    deploymentId: identity.deploymentId,
    buildSha: identity.buildSha,
    identityProvenance:
      environment === 'local'
        ? 'checkout SHA; running server build not verified'
        : 'caller asserted; alias/deployment binding not verified',
    observationWindowMs: THROTTLE.observationWindowMs,
    observationWindowAnchor: 'domcontentloaded',
    lcpMeaning: 'last candidate observed within fixed window; not finalized field LCP',
    throttle: THROTTLE,
    routes: {},
    warmChecks: {},
  };
  try {
    for (const name of selected) {
      const routeStartedAt = new Date().toISOString();
      const state =
        ROUTES[name].role === 'student'
          ? studentState
          : ROUTES[name].role === 'teacher'
            ? teacherState
            : undefined;
      const samples = [];
      for (let i = 0; i < THROTTLE.samplesPerRoute; i++) {
        const sampleStartedAt = new Date().toISOString();
        try {
          const sample = await oneSample(browser, target, name, state);
          samples.push({
            sampleIndex: i + 1,
            startedAt: sampleStartedAt,
            completedAt: new Date().toISOString(),
            ...sample,
          });
        } catch {
          samples.push({
            sampleIndex: i + 1,
            startedAt: sampleStartedAt,
            completedAt: new Date().toISOString(),
            ...sanitizeSample({ error: 'navigation' }),
          });
        }
      }
      report.routes[name] = {
        template: ROUTES[name].template,
        access: ROUTES[name].access,
        startedAt: routeStartedAt,
        completedAt: new Date().toISOString(),
        sampleOrder: 'sequential',
        sampleCount: samples.length,
        summary: summarizeSamples(samples),
        samples,
      };
      if (args['warm-public'] && ROUTES[name].access === 'public') {
        const startedAt = new Date().toISOString();
        const warmCheck = await oneSample(browser, target, name, undefined, true);
        report.warmChecks[name] = {
          startedAt,
          completedAt: new Date().toISOString(),
          ...warmCheck,
        };
      }
    }
  } finally {
    await browser.close();
  }
  report.runCompletedAt = new Date().toISOString();
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
