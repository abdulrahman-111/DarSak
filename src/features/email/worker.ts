import 'server-only';
import nodemailer from 'nodemailer';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailConfig } from './config';
import { renderEmail, type EmailKind } from './templates';

const ADMIN_MAILBOX = 'abdulrahman.gomaa.h05@gmail.com';
const SMTP_USER = ADMIN_MAILBOX;
const SEND_DEADLINE_MS = 15_000;
const STORE_DEADLINE_MS = 5_000;
const TOTAL_BUDGET_MS = 38_000;
/** Upper bound per run; the time budget above normally stops a run earlier. */
export const MAX_EMAIL_JOBS_PER_RUN = 50;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EmailJob = {
  id: string;
  lease_token: string;
  kind: EmailKind;
  payload: Record<string, unknown>;
  recipient_email: string;
  created_at: string;
  attempts: number;
};
export type WorkerCounts = {
  state: 'ok' | 'not_configured' | 'error';
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  unsettled: number;
};
export type EmailOutboxStore = {
  claim: (limit: number) => Promise<{ jobs: EmailJob[]; skipped: number }>;
  settle: (
    id: string,
    leaseToken: string,
    outcome: 'sent' | 'retry' | 'failed' | 'skipped',
    errorCode?: string,
  ) => Promise<boolean>;
};
export type EmailTransport = {
  sendMail: (message: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
};
export type WorkerDeps = {
  store: EmailOutboxStore;
  send: (job: EmailJob, message: { subject: string; text: string; html: string }) => Promise<void>;
  now?: () => number;
};

function isEmailJob(value: unknown): value is EmailJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as Partial<EmailJob>;
  return (
    typeof job.id === 'string' &&
    uuid.test(job.id) &&
    typeof job.lease_token === 'string' &&
    uuid.test(job.lease_token) &&
    typeof job.kind === 'string' &&
    typeof job.recipient_email === 'string' &&
    job.recipient_email.length <= 320 &&
    Number.isInteger(job.attempts) &&
    Number(job.attempts) >= 1 &&
    Number(job.attempts) <= 5 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.recipient_email) &&
    !!job.payload &&
    typeof job.payload === 'object' &&
    !Array.isArray(job.payload)
  );
}

export function classifyEmailError(error: unknown): { outcome: 'retry' | 'failed'; code: string } {
  const item =
    error && typeof error === 'object'
      ? (error as { code?: unknown; responseCode?: unknown; command?: unknown })
      : {};
  const code = typeof item.code === 'string' ? item.code : '';
  const responseCode = typeof item.responseCode === 'number' ? item.responseCode : 0;
  if (code === 'EMAIL_SEND_TIMEOUT' || code === 'ETIMEDOUT' || code === 'ESOCKET')
    return { outcome: 'retry', code: 'connection_timeout' };
  if (
    code === 'ECONNECTION' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EDNS' ||
    code === 'EAI_AGAIN'
  )
    return { outcome: 'retry', code: 'connection_error' };
  if (responseCode >= 500 && responseCode < 600)
    return { outcome: 'failed', code: 'smtp_permanent' };
  if (responseCode >= 400 && responseCode < 500)
    return { outcome: 'retry', code: 'smtp_transient' };
  if (code === 'EENVELOPE' || code === 'EINVALIDRECIPIENT')
    return { outcome: 'failed', code: 'invalid_recipient' };
  return { outcome: 'retry', code: 'smtp_transient' };
}

/** Executes up to maxJobs (capped at MAX_EMAIL_JOBS_PER_RUN), claiming each individually, stopping within the time budget and inside a 120s DB lease. */
export async function runEmailWorker(
  deps: WorkerDeps,
  origin: string,
  maxJobs = 5,
): Promise<WorkerCounts> {
  const counts: WorkerCounts = {
    state: 'ok',
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    unsettled: 0,
  };
  const now = deps.now ?? Date.now;
  const startedAt = now();
  for (let index = 0; index < Math.min(MAX_EMAIL_JOBS_PER_RUN, Math.max(0, maxJobs)); index += 1) {
    // Reserve a full claim + send + settle window before claiming the next job.
    if (now() - startedAt >= TOTAL_BUDGET_MS - (STORE_DEADLINE_MS * 2 + SEND_DEADLINE_MS)) break;
    let result: { jobs: EmailJob[]; skipped: number };
    try {
      result = await deps.store.claim(1);
    } catch {
      counts.state = 'error';
      break;
    }
    counts.skipped +=
      Number.isSafeInteger(result.skipped) && result.skipped > 0 ? result.skipped : 0;
    const job = result.jobs.find(isEmailJob);
    if (!job) break;
    counts.claimed += 1;
    const message = renderEmail(job.kind, job.payload, origin);
    if (!message) {
      try {
        if (await deps.store.settle(job.id, job.lease_token, 'skipped', 'invalid_recipient'))
          counts.skipped += 1;
        else {
          counts.state = 'error';
          counts.unsettled += 1;
        }
      } catch {
        counts.state = 'error';
        counts.unsettled += 1;
      }
      continue;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        deps.send(job, message),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(Object.assign(new Error('deadline'), { code: 'EMAIL_SEND_TIMEOUT' })),
            SEND_DEADLINE_MS,
          );
        }),
      ]);
      try {
        if (await deps.store.settle(job.id, job.lease_token, 'sent')) counts.sent += 1;
        else {
          counts.state = 'error';
          counts.unsettled += 1;
        }
      } catch {
        counts.state = 'error';
        counts.unsettled += 1;
      }
    } catch (error) {
      const classified = classifyEmailError(error);
      const finalOutcome =
        classified.outcome === 'retry' && job.attempts >= 5 ? 'failed' : classified.outcome;
      const finalCode =
        classified.outcome === 'retry' && job.attempts >= 5 ? 'max_attempts' : classified.code;
      try {
        if (await deps.store.settle(job.id, job.lease_token, finalOutcome, finalCode)) {
          if (finalOutcome === 'retry') counts.retried += 1;
          else counts.failed += 1;
        } else {
          counts.state = 'error';
          counts.unsettled += 1;
        }
      } catch {
        counts.state = 'error';
        counts.unsettled += 1;
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return counts;
}

function productionStore(): EmailOutboxStore {
  const client = createAdminClient();
  return {
    async claim(limit) {
      const { data, error } = await client.rpc('claim_email_jobs', { p_limit: limit });
      if (error || !data || typeof data !== 'object') throw new Error('email_claim_failed');
      const result = data as { jobs?: unknown; skipped?: unknown };
      return {
        jobs: Array.isArray(result.jobs) ? result.jobs.filter(isEmailJob) : [],
        skipped: typeof result.skipped === 'number' ? result.skipped : 0,
      };
    },
    async settle(id, leaseToken, outcome, errorCode) {
      const { data, error } = await client.rpc('settle_email_job', {
        p_id: id,
        p_lease_token: leaseToken,
        p_outcome: outcome,
        p_error_code: errorCode ?? null,
      });
      return !error && data === true;
    },
  };
}

async function sendProduction(
  job: EmailJob,
  message: { subject: string; text: string; html: string },
  appPassword: string,
): Promise<void> {
  const transport: EmailTransport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: appPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    dnsTimeout: 10_000,
    tls: { rejectUnauthorized: true },
    logger: false,
    debug: false,
    transactionLog: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const timer = setTimeout(() => transport.close(), SEND_DEADLINE_MS);
  try {
    await transport.sendMail({
      from: `DarSak <${SMTP_USER}>`,
      to: job.recipient_email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<${job.id}@dars>`,
    });
  } finally {
    clearTimeout(timer);
    transport.close();
  }
}

/** Production is deliberately disabled unless all private mail configuration is present. */
export async function flushEmailOutbox(maxJobs = 5): Promise<WorkerCounts> {
  const config = emailConfig();
  if (!config)
    return {
      state: 'not_configured',
      claimed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      unsettled: 0,
    };
  try {
    const store = productionStore();
    return await runEmailWorker(
      { store, send: (job, message) => sendProduction(job, message, config.appPassword) },
      config.origin,
      maxJobs,
    );
  } catch {
    return { state: 'error', claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0, unsettled: 0 };
  }
}
