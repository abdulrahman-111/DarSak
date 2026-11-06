import { describe, expect, it } from 'vitest';
import {
  summarizeSamples,
  validateTarget,
  validatePrivateStateUse,
  resolveBuildIdentity,
  sanitizeSample,
  routeFromFinalUrl,
  parseServerTiming,
} from '../../scripts/measure-routes.mjs';

describe('route benchmark summaries', () => {
  it('uses median and nearest-rank p90 for valid numeric samples', () => {
    const result = summarizeSamples([
      { status: 200, ttfbMs: 10, fcpMs: 20, lcpMs: 30, serverTimingMs: null },
      { status: 200, ttfbMs: 20, fcpMs: 30, lcpMs: 40, serverTimingMs: 5 },
      { status: 200, ttfbMs: 30, fcpMs: 40, lcpMs: 50, serverTimingMs: null },
      { status: 200, ttfbMs: 40, fcpMs: 50, lcpMs: 60, serverTimingMs: null },
      { status: 200, ttfbMs: 50, fcpMs: 60, lcpMs: 70, serverTimingMs: null },
      { status: 200, ttfbMs: 60, fcpMs: 70, lcpMs: 80, serverTimingMs: null },
      { status: 200, ttfbMs: 70, fcpMs: 80, lcpMs: 90, serverTimingMs: null },
      { status: 200, ttfbMs: 80, fcpMs: 90, lcpMs: 100, serverTimingMs: null },
      { status: 200, ttfbMs: 90, fcpMs: 100, lcpMs: 110, serverTimingMs: null },
      { status: 200, ttfbMs: 100, fcpMs: 110, lcpMs: 120, serverTimingMs: null },
    ]);

    expect(result.metrics.ttfbMs).toEqual({ count: 10, median: 55, p90: 90 });
    expect(result.metrics.lcpMs).toEqual({ count: 10, median: 75, p90: 110 });
  });

  it('keeps Server-Timing nullable and reads numeric durations only', () => {
    expect(parseServerTiming('app;dur=2.5, db;dur=7;desc="safe"')).toBe(9.5);
    expect(parseServerTiming('app;desc="not recorded"')).toBeNull();
  });

  it('keeps redirects, missing timings, and request errors visible in incomplete results', () => {
    const result = summarizeSamples([
      { status: 200, ttfbMs: 12, fcpMs: 22, lcpMs: null, serverTimingMs: null },
      {
        status: 302,
        ttfbMs: 9,
        fcpMs: null,
        lcpMs: null,
        serverTimingMs: null,
        error: 'redirected',
      },
      {
        status: null,
        ttfbMs: null,
        fcpMs: null,
        lcpMs: null,
        serverTimingMs: null,
        error: 'timeout',
      },
    ]);

    expect(result.complete).toBe(false);
    expect(result.sampleCount).toBe(3);
    expect(result.errors).toEqual([
      { sample: 0, metric: 'lcpMs', error: 'missing' },
      { sample: 1, status: 302, error: 'redirected' },
      { sample: 1, metric: 'fcpMs', error: 'missing' },
      { sample: 1, metric: 'lcpMs', error: 'missing' },
      { sample: 2, status: null, error: 'timeout' },
      { sample: 2, metric: 'ttfbMs', error: 'missing' },
      { sample: 2, metric: 'fcpMs', error: 'missing' },
      { sample: 2, metric: 'lcpMs', error: 'missing' },
    ]);
  });
});

describe('route benchmark safety boundaries', () => {
  it('accepts loopback and exact production/staging origins only', () => {
    expect(validateTarget('http://127.0.0.1:3000', 'local').origin).toBe('http://127.0.0.1:3000');
    expect(validateTarget('https://darsak-platform.vercel.app', 'production').environment).toBe(
      'production',
    );
    expect(
      validateTarget('https://darsak-platform-staging.vercel.app', 'staging').environment,
    ).toBe('staging');
    expect(() => validateTarget('https://evil.example', 'production')).toThrow(/allowlist/);
    expect(() => validateTarget('https://darsak-platform.vercel.app', 'staging')).toThrow(
      /allowlist/,
    );
  });

  it('allows private state only on loopback or declared synthetic staging', () => {
    expect(() =>
      validatePrivateStateUse({
        environment: 'production',
        hasState: true,
        syntheticStaging: false,
      }),
    ).toThrow(/Production private state/);
    expect(() =>
      validatePrivateStateUse({ environment: 'staging', hasState: true, syntheticStaging: false }),
    ).toThrow(/synthetic staging state/);
    expect(() =>
      validatePrivateStateUse({ environment: 'staging', hasState: true, syntheticStaging: true }),
    ).not.toThrow();
    expect(() =>
      validatePrivateStateUse({ environment: 'local', hasState: true, syntheticStaging: false }),
    ).not.toThrow();
  });

  it('does not classify a login redirect as the requested private route', () => {
    expect(
      routeFromFinalUrl(
        'https://darsak-platform.vercel.app/en/login',
        'https://darsak-platform.vercel.app',
      ),
    ).toBeNull();
    expect(
      routeFromFinalUrl(
        'https://darsak-platform.vercel.app/en/student?tab=classes',
        'https://darsak-platform.vercel.app',
      ),
    ).toBe('student-en');
  });

  it('exports sanitized route-template samples without URLs or request secrets', () => {
    const sample = sanitizeSample({
      status: 200,
      ttfbMs: 12,
      fcpMs: 34,
      lcpMs: 56,
      serverTimingMs: null,
      finalUrl: 'https://user:secret@example.test/en/student?id=real-id',
      authorization: 'Bearer private',
      error: 'timeout',
    });
    expect(sample).toEqual({
      status: 200,
      ttfbMs: 12,
      fcpMs: 34,
      lcpMs: 56,
      serverTimingMs: null,
      error: 'timeout',
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
});
