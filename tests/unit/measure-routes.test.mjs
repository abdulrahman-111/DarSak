import { describe, expect, it } from 'vitest';
import {
  classifyDocumentAttempt,
  classifyWarmCheck,
  navigationTtfbMs,
  parseArgs,
  parseServerTiming,
  resolveBuildIdentity,
  routeFromFinalUrl,
  sanitizeSample,
  summarizeSamples,
  validatePrivateStateUse,
  validateStateOrigins,
  validateTarget,
} from '../../scripts/measure-routes.mjs';

describe('route benchmark summaries', () => {
  it('uses median and nearest-rank p90 for valid numeric samples', () => {
    const result = summarizeSamples(
      Array.from({ length: 10 }, (_, i) => ({
        valid: true,
        status: 200,
        ttfbMs: (i + 1) * 10,
        fcpMs: (i + 2) * 10,
        lcpMs: (i + 3) * 10,
        serverTiming: null,
      })),
    );

    expect(result.metrics.ttfbMs).toEqual({ count: 10, median: 55, p90: 90 });
    expect(result.metrics.lcpMs).toEqual({ count: 10, median: 75, p90: 110 });
    expect(result.validSampleCount).toBe(10);
    expect(result.excludedSampleCount).toBe(0);
    expect(result.metricMissingCounts).toEqual({ ttfbMs: 0, fcpMs: 0, lcpMs: 0 });
  });

  it('excludes numeric timings from redirects, server errors, and failed pages', () => {
    const result = summarizeSamples([
      { valid: true, status: 200, ttfbMs: 100, fcpMs: 200, lcpMs: 300, serverTiming: null },
      {
        valid: false,
        status: 200,
        ttfbMs: 1,
        fcpMs: 2,
        lcpMs: 3,
        serverTiming: null,
        error: 'redirected',
      },
      {
        valid: false,
        status: 500,
        ttfbMs: 2,
        fcpMs: 3,
        lcpMs: 4,
        serverTiming: null,
        error: 'http-status',
      },
      {
        valid: false,
        status: null,
        ttfbMs: 3,
        fcpMs: 4,
        lcpMs: 5,
        serverTiming: null,
        error: 'timeout',
      },
    ]);
    expect(result.metrics.ttfbMs).toEqual({ count: 1, median: 100, p90: 100 });
    expect(result.metrics.fcpMs).toEqual({ count: 1, median: 200, p90: 200 });
    expect(result.metrics.lcpMs).toEqual({ count: 1, median: 300, p90: 300 });
    expect(result.validSampleCount).toBe(1);
    expect(result.excludedSampleCount).toBe(3);
  });

  it('keeps missing metric counts and errors visible without adding them to metrics', () => {
    const result = summarizeSamples([
      { valid: true, status: 200, ttfbMs: 12, fcpMs: 22, lcpMs: null, serverTiming: null },
      { valid: false, status: 302, ttfbMs: 9, fcpMs: null, lcpMs: null, error: 'redirected' },
      { valid: false, status: null, ttfbMs: null, fcpMs: null, lcpMs: null, error: 'timeout' },
    ]);

    expect(result.complete).toBe(false);
    expect(result.sampleCount).toBe(3);
    expect(result.validSampleCount).toBe(1);
    expect(result.excludedSampleCount).toBe(2);
    expect(result.metricMissingCounts).toEqual({ ttfbMs: 1, fcpMs: 2, lcpMs: 3 });
    expect(result.metrics.lcpMs).toEqual({ count: 0, median: null, p90: null });
    expect(result.errors).toContainEqual({ sample: 1, status: 302, error: 'redirected' });
    expect(result.errors).toContainEqual({ sample: 0, metric: 'lcpMs', error: 'missing' });
  });

  it('keeps overlapping Server-Timing entries separate and bounded', () => {
    expect(parseServerTiming('app;dur=100, db;dur=80;desc="overlap, ignored"')).toEqual([
      { name: 'app', durationMs: 100 },
      { name: 'db', durationMs: 80 },
    ]);
    expect(parseServerTiming('unknown;dur=7, app;desc="x";dur=2.5')).toEqual([
      { name: 'app', durationMs: 2.5 },
    ]);
    expect(parseServerTiming('app;dur=NaN, db;dur=-2, edge;dur=Infinity')).toBeNull();
    expect(parseServerTiming(null)).toBeNull();
  });

  it('uses user-visible navigation TTFB from activation time, not request start', () => {
    expect(
      navigationTtfbMs({
        startTime: 0,
        activationStart: 0,
        requestStart: 60,
        responseStart: 100,
      }),
    ).toBe(100);
    expect(
      navigationTtfbMs({
        startTime: 0,
        activationStart: 25,
        requestStart: 60,
        responseStart: 100,
      }),
    ).toBe(75);
    expect(
      navigationTtfbMs({
        startTime: 0,
        activationStart: 0,
        requestStart: 60,
        responseStart: 0,
      }),
    ).toBeNull();
  });
});

describe('route benchmark safety boundaries', () => {
  const origin = 'https://darsak-staging-theag01s-projects.vercel.app';

  it('accepts loopback and exact production/staging origins only', () => {
    expect(validateTarget('http://127.0.0.1:3000', 'local').origin).toBe('http://127.0.0.1:3000');
    expect(validateTarget('https://darsak-platform.vercel.app', 'production').environment).toBe(
      'production',
    );
    expect(validateTarget(origin, 'staging').origin).toBe(origin);
    expect(() => validateTarget('https://evil.example', 'production')).toThrow(/allowlist/);
    expect(() => validateTarget('https://darsak-platform-staging.vercel.app', 'staging')).toThrow(
      /allowlist/,
    );
  });

  it('allows private state only on loopback or asserted synthetic staging', () => {
    expect(() =>
      validatePrivateStateUse({
        environment: 'production',
        hasState: true,
        syntheticStaging: false,
      }),
    ).toThrow(/Production private state/);
    expect(() =>
      validatePrivateStateUse({ environment: 'staging', hasState: true, syntheticStaging: false }),
    ).toThrow(/synthetic staging fixtures/);
    expect(() =>
      validatePrivateStateUse({ environment: 'staging', hasState: true, syntheticStaging: true }),
    ).not.toThrow();
    expect(() =>
      validatePrivateStateUse({ environment: 'local', hasState: true, syntheticStaging: false }),
    ).not.toThrow();
  });

  it('rejects foreign cookie domains and localStorage origins without including their values', () => {
    expect(() =>
      validateStateOrigins(
        {
          cookies: [{ domain: '.other.example', name: 'secret', value: 'private' }],
          origins: [],
        },
        { origin, environment: 'staging' },
      ),
    ).toThrow(/outside the selected origin boundary/);
    expect(() =>
      validateStateOrigins(
        { cookies: [], origins: [{ origin: 'https://other.example', localStorage: [] }] },
        { origin, environment: 'staging' },
      ),
    ).toThrow(/outside the selected origin boundary/);
  });

  it('does not classify a login redirect as the requested private route', () => {
    expect(routeFromFinalUrl(`${origin}/en/login`, origin)).toBeNull();
    expect(routeFromFinalUrl(`${origin}/en/student?tab=classes`, origin)).toBe('student-en');
  });

  it('rejects HTTP and SPA login transitions, origin escapes, and document replacement', () => {
    const requested = `${origin}/en/student`;
    const valid = {
      origin,
      expectedRoute: 'student-en',
      status: 200,
      responseUrl: requested,
      initialUrl: requested,
      finalUrl: requested,
      initialTimeOrigin: 100,
      finalTimeOrigin: 100,
      mainFrameRoutes: ['student-en', 'student-en'],
      redirectedFromUrls: [],
      externalNavigationBlocked: false,
    };
    expect(classifyDocumentAttempt(valid)).toEqual({ valid: true, error: null });
    expect(classifyDocumentAttempt({ ...valid, externalNavigationBlocked: true })).toEqual({
      valid: false,
      error: 'external-navigation-blocked',
    });
    expect(classifyDocumentAttempt({ ...valid, responseUrl: `${origin}/en/login` })).toEqual({
      valid: false,
      error: 'redirected',
    });
    expect(classifyDocumentAttempt({ ...valid, initialUrl: `${origin}/en/login` })).toEqual({
      valid: false,
      error: 'redirected',
    });
    expect(
      classifyDocumentAttempt({ ...valid, mainFrameRoutes: ['student-en', null, 'student-en'] }),
    ).toEqual({ valid: false, error: 'redirected' });
    expect(
      classifyDocumentAttempt({ ...valid, redirectedFromUrls: [requested, `${origin}/en/login`] }),
    ).toEqual({ valid: false, error: 'redirected' });
    expect(classifyDocumentAttempt({ ...valid, redirectedFromUrls: [requested] })).toEqual({
      valid: false,
      error: 'redirected',
    });
    expect(classifyDocumentAttempt({ ...valid, status: 500 })).toEqual({
      valid: false,
      error: 'http-status',
    });
    expect(classifyDocumentAttempt({ ...valid, finalTimeOrigin: 200 })).toEqual({
      valid: false,
      error: 'document-changed',
    });
  });

  it('does not treat an SSO cache hit as a valid warm-route check', () => {
    expect(classifyWarmCheck({ valid: false, error: 'redirected', status: 200 }, 'HIT')).toEqual({
      valid: false,
      status: 200,
      error: 'redirected',
      cache: 'unknown',
    });
    expect(classifyWarmCheck({ valid: true, error: null, status: 200 }, 'HIT')).toEqual({
      valid: true,
      status: 200,
      error: null,
      cache: 'HIT',
    });
  });

  it('exports sanitized samples without URLs or request secrets', () => {
    const sample = sanitizeSample({
      valid: false,
      status: 200,
      ttfbMs: 12,
      fcpMs: 34,
      lcpMs: 56,
      serverTiming: [{ name: 'app', durationMs: 4 }],
      finalUrl: 'https://user:secret@example.test/en/student?id=real-id',
      authorization: 'Bearer private',
      error: 'redirected',
    });
    expect(sample).toEqual({
      valid: false,
      status: 200,
      ttfbMs: 12,
      fcpMs: 34,
      lcpMs: 56,
      serverTiming: [{ name: 'app', durationMs: 4 }],
      error: 'redirected',
    });
    expect(JSON.stringify(sample)).not.toMatch(/example\.test|real-id|private|Bearer/);
  });

  it('requires exact hosted build and deployment identities instead of guessing', () => {
    expect(() =>
      resolveBuildIdentity({ environment: 'production', buildSha: null, deploymentId: null }),
    ).toThrow(/exact hosted build SHA and deployment ID/);
    expect(
      resolveBuildIdentity({
        environment: 'staging',
        buildSha: 'a'.repeat(40),
        deploymentId: 'dpl-staging-123',
      }),
    ).toEqual({ buildSha: 'a'.repeat(40), deploymentId: 'dpl-staging-123' });
  });

  it('rejects unknown CLI flags instead of silently running defaults', () => {
    expect(() => parseArgs(['--enviroment', 'production'])).toThrow(/Unknown option/);
  });
});
