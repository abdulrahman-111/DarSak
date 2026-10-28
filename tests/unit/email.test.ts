import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { emailConfig } from '@/features/email/config';
import {
  classifyEmailError,
  flushEmailOutbox,
  MAX_EMAIL_JOBS_PER_RUN,
  runEmailWorker,
  type EmailOutboxStore,
} from '@/features/email/worker';
import { renderEmail } from '@/features/email/templates';
import { validCronAuthorization } from '@/app/api/email/cron/auth';

const id = '5a4c7d3e-1f2a-4b67-8c90-123456789abc';
const job = {
  id,
  lease_token: id,
  kind: 'teacher_review_requested' as const,
  payload: { teacher_id: id, teacher_name: '<script>alert(1)</script>' },
  recipient_email: 'admin@example.test',
  created_at: '2026-10-14T00:00:00Z',
  attempts: 1,
};
afterEach(() => vi.unstubAllEnvs());

describe('transactional email boundaries', () => {
  it('does not enable production delivery when any required private setting is absent', () => {
    expect(
      emailConfig({ VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://dars.example' }),
    ).toBeNull();
    expect(
      emailConfig({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://localhost',
        GMAIL_APP_PASSWORD: 'x',
        SUPABASE_SERVICE_ROLE_KEY: 'y',
        NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
      }),
    ).toBeNull();
    expect(
      emailConfig({
        VERCEL_ENV: 'development',
        NEXT_PUBLIC_SITE_URL: 'https://dars.example',
        GMAIL_APP_PASSWORD: 'x',
        SUPABASE_SERVICE_ROLE_KEY: 'y',
        NEXT_PUBLIC_SUPABASE_URL: 'https://db.example',
      }),
    ).toBeNull();
  });

  it('returns not_configured before constructing a claim client outside production', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(await flushEmailOutbox()).toEqual({
      state: 'not_configured',
      claimed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      unsettled: 0,
    });
  });

  it('escapes payload text and rejects invalid trusted route identifiers', () => {
    const mail = renderEmail('teacher_review_requested', job.payload, 'https://dars.example');
    expect(mail?.html).toContain('Open DarSak');
    expect(mail?.html).toContain('&lt;script&gt;');
    expect(mail?.html).not.toContain('<script>');
    expect(mail?.text).toContain('https://darsak-admin-portal.vercel.app/en/admin/teachers/' + id);
    expect(mail?.text).toContain('https://darsak-admin-portal.vercel.app/ar/admin/teachers/' + id);
    expect(
      renderEmail(
        'enrollment_requested',
        { group_id: 'javascript:alert(1)' },
        'https://dars.example',
      ),
    ).toBeNull();
  });

  it('routes teacher review decisions to the Account application page', () => {
    const approved = renderEmail(
      'teacher_review_approved',
      { teacher_id: id },
      'https://dars.example',
    );
    const declined = renderEmail(
      'teacher_review_declined',
      { teacher_id: id },
      'https://dars.example',
    );
    expect(approved?.text).toContain('https://dars.example/en/account/application');
    expect(declined?.text).toContain('https://dars.example/ar/account/application');
  });

  it('classifies only to a safe retry code and keeps errors out of output', () => {
    expect(classifyEmailError({ responseCode: 451, message: 'private server response' })).toEqual({
      outcome: 'retry',
      code: 'smtp_transient',
    });
    expect(classifyEmailError({ responseCode: 550, message: 'private server response' })).toEqual({
      outcome: 'failed',
      code: 'smtp_permanent',
    });
  });

  it('claims one at a time and settles the injected fake transport result', async () => {
    const settle = vi.fn(async () => true);
    let claimed = false;
    const store: EmailOutboxStore = {
      claim: vi.fn(async () => {
        if (claimed) return { jobs: [], skipped: 0 };
        claimed = true;
        return { jobs: [job], skipped: 0 };
      }),
      settle,
    };
    const result = await runEmailWorker(
      { store, send: vi.fn(async () => {}), now: () => 0 },
      'https://dars.example',
      5,
    );
    expect(store.claim).toHaveBeenCalledWith(1);
    expect(settle).toHaveBeenCalledWith(id, id, 'sent');
    expect(result).toMatchObject({ state: 'ok', claimed: 1, sent: 1 });
  });

  it('reports SMTP acceptance as unsettled if the fenced database settle refuses it', async () => {
    const store: EmailOutboxStore = {
      claim: async () => ({ jobs: [job], skipped: 0 }),
      settle: async () => false,
    };
    const result = await runEmailWorker(
      { store, send: async () => {}, now: () => 0 },
      'https://dars.example',
      1,
    );
    expect(result).toMatchObject({ state: 'error', claimed: 1, sent: 0, unsettled: 1 });
  });

  it('fails a transient fifth attempt instead of scheduling a sixth try', async () => {
    const fifth = { ...job, attempts: 5 };
    const settle = vi.fn(async () => true);
    const store: EmailOutboxStore = { claim: async () => ({ jobs: [fifth], skipped: 0 }), settle };
    const result = await runEmailWorker(
      {
        store,
        send: async () => {
          throw { responseCode: 451 };
        },
        now: () => 0,
      },
      'https://dars.example',
      1,
    );
    expect(settle).toHaveBeenCalledWith(id, id, 'failed', 'max_attempts');
    expect(result).toMatchObject({ failed: 1, retried: 0 });
  });

  it('closes a pending fake send at the hard deadline and safely schedules retry', async () => {
    vi.useFakeTimers();
    try {
      const settle = vi.fn(async () => true);
      const store: EmailOutboxStore = { claim: async () => ({ jobs: [job], skipped: 0 }), settle };
      const pending = runEmailWorker(
        { store, send: async () => new Promise<void>(() => {}), now: () => 0 },
        'https://dars.example',
        1,
      );
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await pending;
      expect(settle).toHaveBeenCalledWith(id, id, 'retry', 'connection_timeout');
      expect(result).toMatchObject({ retried: 1, state: 'ok' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('drains more than five queued jobs in one run while the time budget allows', async () => {
    let remaining = 12;
    const store: EmailOutboxStore = {
      claim: vi.fn(async () => {
        if (remaining === 0) return { jobs: [], skipped: 0 };
        remaining -= 1;
        return { jobs: [job], skipped: 0 };
      }),
      settle: vi.fn(async () => true),
    };
    const result = await runEmailWorker(
      { store, send: vi.fn(async () => {}), now: () => 0 },
      'https://dars.example',
      MAX_EMAIL_JOBS_PER_RUN,
    );
    expect(result).toMatchObject({ state: 'ok', claimed: 12, sent: 12 });
    expect(remaining).toBe(0);
  });

  it('stops claiming once the run would exceed its time budget', async () => {
    let clock = 0;
    const store: EmailOutboxStore = {
      claim: vi.fn(async () => ({ jobs: [job], skipped: 0 })),
      settle: vi.fn(async () => true),
    };
    const result = await runEmailWorker(
      {
        store,
        send: vi.fn(async () => {
          clock += 4_000;
        }),
        now: () => clock,
      },
      'https://dars.example',
      MAX_EMAIL_JOBS_PER_RUN,
    );
    expect(result.sent).toBeGreaterThan(0);
    expect(result.sent).toBeLessThan(MAX_EMAIL_JOBS_PER_RUN);
    expect(clock).toBeLessThanOrEqual(38_000);
  });

  it('requires exact constant-time cron bearer input and denies missing secrets', () => {
    expect(validCronAuthorization('Bearer secret', 'secret')).toBe(true);
    expect(validCronAuthorization('Bearer longer', 'secret')).toBe(false);
    expect(validCronAuthorization('Bearer secret', undefined)).toBe(false);
    expect(validCronAuthorization('secret', 'secret')).toBe(false);
  });
});

describe('user-supplied names in notification emails', () => {
  const origin = 'https://dars.example';
  const url = 'https://evil.example';

  it('defangs URL-like student names in text and html bodies', () => {
    const mail = renderEmail(
      'enrollment_requested',
      { group_id: id, group_name: 'Physics', student_name: 'Pay now at https://evil.example' },
      origin,
    );
    expect(mail).not.toBeNull();
    for (const body of [mail!.text, mail!.html]) {
      expect(body).not.toContain('https://evil');
      expect(body).not.toContain('evil.example');
      expect(body).toContain('[://]');
      expect(body).toContain('evil[.]example');
    }
  });

  it('defangs URL-like teacher and group names', () => {
    const teacher = renderEmail(
      'teacher_review_requested',
      { teacher_id: id, teacher_name: 'www.evil.example' },
      origin,
    );
    expect(teacher?.text).not.toContain('www.evil.example');
    expect(teacher?.html).not.toContain('www.evil.example');
    expect(teacher?.text).toContain('www[.]evil[.]example');

    const group = renderEmail(
      'enrollment_requested',
      { group_id: id, group_name: 'http://evil.example/login', student_name: 'Sara' },
      origin,
    );
    expect(group?.text).not.toContain('http://');
    expect(group?.html).not.toContain('evil.example');
    expect(group?.text).not.toContain(url);
  });

  it('keeps normal Arabic and English names unchanged', () => {
    const en = renderEmail(
      'teacher_review_requested',
      { teacher_id: id, teacher_name: 'Youssef Karim' },
      origin,
    );
    expect(en?.text).toContain('(Youssef Karim)');
    expect(en?.html).toContain('(Youssef Karim)');

    const ar = renderEmail(
      'teacher_review_requested',
      { teacher_id: id, teacher_name: 'يوسف كريم' },
      origin,
    );
    expect(ar?.text).toContain('(يوسف كريم)');
    expect(ar?.html).toContain('(يوسف كريم)');

    const enrollment = renderEmail(
      'enrollment_requested',
      { group_id: id, group_name: 'Physics 101', student_name: 'Youssef Karim' },
      origin,
    );
    expect(enrollment?.text).toContain(
      'A student ("Youssef Karim") requested to join "Physics 101".',
    );
    expect(enrollment?.text).toContain('الطالب ("Youssef Karim") طلب الانضمام إلى "Physics 101".');
  });
});
