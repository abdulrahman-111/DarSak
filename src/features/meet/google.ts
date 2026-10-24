import { deterministicEventId, validateGoogleMeetUri } from './domain';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const REQUEST_TIMEOUT_MS = 10_000;

export type GoogleProviderErrorCode =
  | 'temporarily_unavailable'
  | 'reconnect_required'
  | 'unsupported'
  | 'conflict'
  | 'not_found'
  | 'invalid_response';

export class GoogleProviderError extends Error {
  readonly name = 'GoogleProviderError';
  constructor(
    readonly code: GoogleProviderErrorCode,
    readonly retryable: boolean,
  ) {
    super(code.replaceAll('_', ' '));
  }
}

export type GoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string | null;
  scope: string | null;
};

export type GoogleIdentity = { sub: string; email: string; emailVerified: true };
export type GoogleTokenResult = { tokens: GoogleTokens; identity?: GoogleIdentity };

export type GoogleCalendarEvent = {
  id: string;
  status: string | null;
  conferenceStatus: string | null;
  meetUri: string | null;
  startAt: string | null;
  endAt: string | null;
  etag: string | null;
  connectionId: string | null;
  lessonId: string | null;
  generation: number | null;
};

export type GoogleProviderOptions = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type GoogleTokenGrant =
  | { grant: 'authorization_code'; code: string; codeVerifier: string }
  | { grant: 'refresh_token'; refreshToken: string };

export type GoogleEventIdentity = {
  accessToken: string;
  namespace: string;
  connectionId: string;
  lessonId: string;
  generation: number;
};

export type GoogleInsertEventInput = GoogleEventIdentity & {
  conferenceRequestId: string;
  title: string;
  startAt: string;
  endAt: string;
};

function safeError(code: GoogleProviderErrorCode, retryable = false): GoogleProviderError {
  return new GoogleProviderError(code, retryable);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function privateMarker(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

function parseEvent(value: unknown): GoogleCalendarEvent {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[a-z0-9_-]{5,1024}$/.test(value.id)) {
    throw safeError('invalid_response');
  }
  const conferenceData = isRecord(value.conferenceData) ? value.conferenceData : {};
  const rawStatus =
    isRecord(conferenceData.createRequest) && isRecord(conferenceData.createRequest.status)
      ? conferenceData.createRequest.status.statusCode
      : null;
  const entryPoints = Array.isArray(conferenceData.entryPoints) ? conferenceData.entryPoints : [];
  const videoUri = entryPoints.find(
    entry => isRecord(entry) && entry.entryPointType === 'video',
  ) as Record<string, unknown> | undefined;
  const privateProperties =
    isRecord(value.extendedProperties) && isRecord(value.extendedProperties.private)
      ? value.extendedProperties.private
      : {};
  const generation =
    typeof privateProperties.darsakGeneration === 'string' &&
    /^\d{1,9}$/.test(privateProperties.darsakGeneration)
      ? Number(privateProperties.darsakGeneration)
      : null;
  let meetUri: string | null = null;
  if (videoUri && typeof videoUri.uri === 'string') {
    try {
      meetUri = validateGoogleMeetUri(videoUri.uri);
    } catch {
      throw safeError('unsupported');
    }
  }
  return {
    id: value.id,
    status: typeof value.status === 'string' ? value.status : null,
    conferenceStatus: typeof rawStatus === 'string' ? rawStatus : null,
    meetUri,
    startAt:
      isRecord(value.start) && typeof value.start.dateTime === 'string'
        ? value.start.dateTime
        : null,
    endAt:
      isRecord(value.end) && typeof value.end.dateTime === 'string' ? value.end.dateTime : null,
    etag: typeof value.etag === 'string' ? value.etag : null,
    connectionId: privateMarker(privateProperties.darsakConnectionId),
    lessonId: privateMarker(privateProperties.darsakLessonId),
    generation: generation && generation > 0 ? generation : null,
  };
}

export class GoogleMeetProvider {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: GoogleProviderOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async obtainToken(grant: GoogleTokenGrant): Promise<GoogleTokenResult> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
    });
    if (grant.grant === 'authorization_code') {
      body.set('grant_type', 'authorization_code');
      body.set('code', grant.code);
      body.set('code_verifier', grant.codeVerifier);
      body.set('redirect_uri', this.options.redirectUri);
    } else {
      body.set('grant_type', 'refresh_token');
      body.set('refresh_token', grant.refreshToken);
    }

    const raw = await this.request(
      GOOGLE_TOKEN_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      'token',
    );
    if (
      !isRecord(raw) ||
      typeof raw.access_token !== 'string' ||
      !raw.access_token ||
      raw.access_token.length > 8192 ||
      typeof raw.token_type !== 'string' ||
      raw.token_type.toLowerCase() !== 'bearer'
    ) {
      throw safeError('invalid_response');
    }
    if (typeof raw.refresh_token === 'string' && raw.refresh_token.length > 8192)
      throw safeError('invalid_response');
    if (typeof raw.scope === 'string' && raw.scope.length > 4096)
      throw safeError('invalid_response');
    const expiresAt =
      typeof raw.expires_in === 'number' &&
      Number.isFinite(raw.expires_in) &&
      raw.expires_in > 0 &&
      raw.expires_in <= 315_360_000
        ? new Date(Date.now() + raw.expires_in * 1000).toISOString()
        : null;
    if (raw.expires_in !== undefined && expiresAt === null) throw safeError('invalid_response');
    const tokens: GoogleTokens = {
      accessToken: raw.access_token,
      ...(typeof raw.refresh_token === 'string' && raw.refresh_token
        ? { refreshToken: raw.refresh_token }
        : {}),
      expiresAt,
      scope: typeof raw.scope === 'string' ? raw.scope : null,
    };
    if (grant.grant === 'refresh_token') return { tokens };

    const profile = await this.request(
      GOOGLE_USERINFO_URL,
      {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      },
      'userinfo',
    );
    if (
      !isRecord(profile) ||
      typeof profile.sub !== 'string' ||
      !profile.sub ||
      profile.sub.length > 255 ||
      typeof profile.email !== 'string' ||
      !profile.email ||
      profile.email.length > 320 ||
      profile.email_verified !== true
    ) {
      throw safeError('unsupported');
    }
    return { tokens, identity: { sub: profile.sub, email: profile.email, emailVerified: true } };
  }

  async revokeToken(token: string): Promise<void> {
    if (!token) throw safeError('unsupported');
    await this.request(
      GOOGLE_REVOKE_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
      },
      'revoke',
      true,
    );
  }

  async insertEvent(input: GoogleInsertEventInput): Promise<GoogleCalendarEvent> {
    const id = deterministicEventId(
      input.namespace,
      input.connectionId,
      input.lessonId,
      input.generation,
    );
    const body = {
      id,
      summary: input.title,
      start: { dateTime: input.startAt },
      end: { dateTime: input.endAt },
      visibility: 'private',
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeOtherGuests: false,
      conferenceData: {
        createRequest: {
          requestId: input.conferenceRequestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      extendedProperties: {
        private: {
          darsakConnectionId: input.connectionId,
          darsakLessonId: input.lessonId,
          darsakGeneration: String(input.generation),
        },
      },
    };
    const url = new URL(GOOGLE_CALENDAR_BASE);
    url.searchParams.set('conferenceDataVersion', '1');
    const raw = await this.request(
      url.toString(),
      this.authorized(input.accessToken, { method: 'POST', body: JSON.stringify(body) }),
      'calendar',
    );
    return parseEvent(raw);
  }

  async getEvent(accessToken: string, eventId: string): Promise<GoogleCalendarEvent> {
    const raw = await this.request(
      this.eventUrl(eventId),
      this.authorized(accessToken),
      'calendar',
    );
    return parseEvent(raw);
  }

  async patchEvent(
    accessToken: string,
    eventId: string,
    input: { title: string; startAt: string; endAt: string; conferenceRequestId?: string },
  ): Promise<GoogleCalendarEvent> {
    const url = new URL(this.eventUrl(eventId));
    url.searchParams.set('conferenceDataVersion', '1');
    const body = {
      summary: input.title,
      start: { dateTime: input.startAt },
      end: { dateTime: input.endAt },
      ...(input.conferenceRequestId
        ? {
            conferenceData: {
              createRequest: {
                requestId: input.conferenceRequestId,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }
        : {}),
    };
    const raw = await this.request(
      url.toString(),
      this.authorized(accessToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      'calendar',
    );
    return parseEvent(raw);
  }

  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    await this.request(
      this.eventUrl(eventId),
      this.authorized(accessToken, { method: 'DELETE' }),
      'calendar',
      true,
    );
  }

  validateMeetUri(uri: string): Promise<string> {
    try {
      return Promise.resolve(validateGoogleMeetUri(uri));
    } catch {
      return Promise.reject(safeError('unsupported'));
    }
  }

  private eventUrl(eventId: string): string {
    if (!/^[a-z0-9_-]{5,1024}$/.test(eventId)) throw safeError('unsupported');
    return `${GOOGLE_CALENDAR_BASE}/${encodeURIComponent(eventId)}`;
  }

  private authorized(accessToken: string, init: RequestInit = {}): RequestInit {
    if (!accessToken) throw safeError('unsupported');
    return {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
    };
  }

  private async request(
    url: string,
    init: RequestInit,
    kind: 'token' | 'userinfo' | 'revoke' | 'calendar',
    allowMissing = false,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw safeError('temporarily_unavailable', true);
    }
    if (response.status >= 300 && response.status < 400) throw safeError('unsupported');
    if (allowMissing && (response.status === 404 || response.status === 410)) return null;
    if (kind === 'revoke' && response.status === 200) return null;
    if (response.status === 409) throw safeError('conflict');
    if (response.status === 204) return null;
    if (response.status === 403 && kind === 'calendar') {
      const quota = await this.isQuotaFailure(response);
      if (quota) throw safeError('temporarily_unavailable', true);
    }
    if (response.status === 401 || (response.status === 403 && kind !== 'revoke'))
      throw safeError('reconnect_required');
    if (response.status === 404 || response.status === 410) throw safeError('not_found');
    if (response.status === 429 || response.status >= 500)
      throw safeError('temporarily_unavailable', true);
    if (!response.ok) {
      if (kind === 'token' && response.status === 400) throw safeError('reconnect_required');
      if (kind === 'calendar' && response.status === 400) throw safeError('unsupported');
      throw safeError('unsupported');
    }
    if (kind === 'revoke') return null;
    try {
      return await response.json();
    } catch {
      throw safeError('invalid_response');
    }
  }

  private async isQuotaFailure(response: Response): Promise<boolean> {
    try {
      const body: unknown = await response.json();
      if (!isRecord(body) || !isRecord(body.error) || !Array.isArray(body.error.errors))
        return false;
      return body.error.errors.some(
        entry =>
          isRecord(entry) &&
          typeof entry.reason === 'string' &&
          ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(entry.reason),
      );
    } catch {
      return false;
    }
  }
}
