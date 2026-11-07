import { NextResponse, type NextRequest } from 'next/server';
import {
  assistantRequestSchema,
  type AssistantErrorCode,
  type AssistantSuccess,
} from '@/features/assistant/domain';
import {
  ProviderOutputValidationError,
  ProviderQuotaError,
  ProviderSafetyBlockedError,
} from '@/features/assistant/provider-errors';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { checkTeachingAccess } from '@/features/teacher-access/guard';
import { getGuidanceTopics } from '@/features/assistant/guidance';
import { getSanadConfig } from '@/features/assistant/config';
import { generateChat, generateGroupDraft } from '@/features/assistant/provider';
import { releaseSanadRequest, reserveSanadRequest } from '@/features/assistant/quota';
import {
  claimProviderAttempt,
  finishProviderAttempt,
  isProviderBreakerEnabled,
  type ProviderOutcome,
} from '@/features/assistant/breaker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BODY_LIMIT = 24 * 1024;
const HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

const statusFor: Record<AssistantErrorCode, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  unavailable: 503,
  rate_limited: 429,
  provider_unavailable: 502,
  safety_blocked: 422,
};

function failure(code: AssistantErrorCode, retryAfter?: number) {
  return NextResponse.json(
    { ok: false, code },
    {
      status: statusFor[code],
      headers: {
        ...HEADERS,
        ...(code === 'rate_limited' ? { 'Retry-After': '60' } : {}),
        ...(code === 'unavailable' && retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      },
    },
  );
}

async function readBoundedJson(request: NextRequest): Promise<unknown | null> {
  if (
    request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !==
    'application/json'
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      /* The client may already have closed the stream. */
    }
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function isEligibleProfile(profile: { status?: string; role?: string } | null): boolean {
  // Admins use the separate admin application and are not part of the public assistant.
  return profile?.status === 'active' && ['student', 'teacher'].includes(profile.role ?? '');
}

export async function GET() {
  const config = getSanadConfig();
  if (!config) return json({ available: false });
  try {
    const { user, profile } = await getRequestViewer();
    return json({ available: Boolean(user && isEligibleProfile(profile)) });
  } catch {
    return json({ available: false });
  }
}

export async function POST(request: NextRequest) {
  const config = getSanadConfig();
  if (!config) return failure('unavailable');

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return failure('invalid_input');
  }
  if (request.headers.get('origin') !== requestOrigin) return failure('invalid_input');

  let raw: unknown | null;
  try {
    raw = await readBoundedJson(request);
  } catch {
    return failure('invalid_input');
  }
  if (raw === null) return failure('invalid_input');
  const parsed = assistantRequestSchema.safeParse(raw);
  if (!parsed.success) return failure('invalid_input');

  let viewer: Awaited<ReturnType<typeof getRequestViewer>>;
  try {
    viewer = await getRequestViewer();
  } catch {
    return failure('unauthenticated');
  }
  const { db, user, profile } = viewer;
  if (!user || !profile || profile.status !== 'active') return failure('unauthenticated');
  if (!isEligibleProfile(profile)) return failure('unavailable');
  let canTeach = false;
  if (profile.role === 'teacher') {
    try {
      canTeach = (await checkTeachingAccess(db)).allowed;
    } catch {
      canTeach = false;
    }
  }
  if (parsed.data.mode === 'group_draft') {
    if (profile.role !== 'teacher') return failure('unavailable');
    if (!canTeach) return failure('unavailable');
  }

  const breakerEnabled = isProviderBreakerEnabled();
  let attempt: string | null = null;
  if (breakerEnabled) {
    let claim: Awaited<ReturnType<typeof claimProviderAttempt>>;
    try {
      claim = await claimProviderAttempt();
    } catch {
      return failure('unavailable');
    }
    if (!claim.allowed) return failure('unavailable', claim.retryAfter);
    attempt = claim.attempt;
  }

  const finish = async (outcome: ProviderOutcome) => {
    if (!attempt) return;
    const claimedAttempt = attempt;
    attempt = null;
    try {
      await finishProviderAttempt(claimedAttempt, outcome);
    } catch {
      /* The database expires abandoned attempts and fences stale completions. */
    }
  };

  if (request.signal.aborted) {
    await finish('cancelled');
    return failure('provider_unavailable');
  }

  let reservation: Awaited<ReturnType<typeof reserveSanadRequest>>;
  try {
    reservation = await reserveSanadRequest(db, config.limits);
  } catch {
    await finish('cancelled');
    return failure('unavailable');
  }
  if (reservation.failed) {
    await finish('cancelled');
    return failure('unavailable');
  }
  if (!reservation.lease) {
    await finish('cancelled');
    return failure('rate_limited');
  }

  let outcome: ProviderOutcome = 'other_error';
  try {
    let result: AssistantSuccess;
    if (parsed.data.mode === 'chat') {
      const access = { role: profile.role, canTeach };
      const topics = getGuidanceTopics(parsed.data.locale, access)
        .map(({ title, answer }) => `${title}: ${answer}`)
        .join('\n');
      result = {
        ok: true,
        mode: 'chat',
        text: await generateChat(config.apiKey, parsed.data, topics, request.signal, {
          role: profile.role,
        }),
      };
    } else {
      result = {
        ok: true,
        mode: 'group_draft',
        draft: await generateGroupDraft(config.apiKey, parsed.data, request.signal),
      };
    }
    if (request.signal.aborted) {
      outcome = 'cancelled';
      return failure('provider_unavailable');
    }
    outcome = 'success';
    return json(result);
  } catch (error) {
    if (request.signal.aborted) {
      outcome = 'cancelled';
      return failure('provider_unavailable');
    }
    if (error instanceof ProviderSafetyBlockedError) {
      outcome = 'success';
      return failure('safety_blocked');
    }
    if (error instanceof ProviderQuotaError) {
      outcome = 'quota_error';
      return failure('provider_unavailable');
    }
    if (error instanceof ProviderOutputValidationError) {
      outcome = 'success';
      return failure('provider_unavailable');
    }
    return failure('provider_unavailable');
  } finally {
    try {
      await releaseSanadRequest(db, reservation.lease);
    } catch {
      /* A lease expires in the database if release fails. */
    }
    if (request.signal.aborted) outcome = 'cancelled';
    await finish(outcome);
  }
}
