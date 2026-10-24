import { describe, expect, it, vi } from 'vitest';
import { GoogleMeetProvider, GoogleProviderError } from '@/features/meet/google';

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://staging.example/api/callback',
};
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const providerWith = (fetchImpl: typeof fetch) =>
  new GoogleMeetProvider({ ...config, fetch: fetchImpl, timeoutMs: 30 });

describe('Google Meet provider', () => {
  it('exchanges authorization codes, verifies identity through fixed userinfo, and requires offline scopes', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        ok({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'openid email https://www.googleapis.com/auth/calendar.events.owned',
        }),
      )
      .mockResolvedValueOnce(
        ok({ sub: 'google-subject', email: 'teacher@example.com', email_verified: true }),
      );
    const provider = providerWith(fetchImpl);
    const result = await provider.obtainToken({
      grant: 'authorization_code',
      code: 'code',
      codeVerifier: 'verifier',
    });

    expect(result.identity).toEqual({
      sub: 'google-subject',
      email: 'teacher@example.com',
      emailVerified: true,
    });
    expect(result.tokens.refreshToken).toBe('refresh');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://openidconnect.googleapis.com/v1/userinfo');
    expect(String(fetchImpl.mock.calls[0][1]?.body)).toContain('code_verifier=verifier');
  });

  it('refreshes tokens without leaking credentials in safe errors', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        ok({ error: 'invalid_grant', error_description: 'refresh-secret rejected' }, 400),
      );
    await expect(
      providerWith(fetchImpl).obtainToken({
        grant: 'refresh_token',
        refreshToken: 'refresh-secret',
      }),
    ).rejects.toMatchObject({ code: 'reconnect_required', retryable: false });
    try {
      await providerWith(fetchImpl).obtainToken({
        grant: 'refresh_token',
        refreshToken: 'refresh-secret',
      });
    } catch (error) {
      expect(String(error)).not.toContain('refresh-secret');
      expect(String(error)).not.toContain('refresh-secret rejected');
    }
  });

  it('uses deterministic valid event IDs and persists the provided conference request ID', async () => {
    let sentUrl = '';
    let sentBody = '';
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      sentUrl = String(input);
      sentBody = String(init?.body ?? '');
      return ok({
        id: 'eventid',
        status: 'confirmed',
        conferenceData: {
          createRequest: { requestId: 'request-1', status: { statusCode: 'pending' } },
        },
        extendedProperties: {
          private: {
            darsakConnectionId: 'conn-1',
            darsakLessonId: 'lesson-1',
            darsakGeneration: '2',
          },
        },
      });
    });
    const provider = providerWith(fetchImpl);
    const input = {
      accessToken: 'access',
      namespace: 'staging',
      connectionId: 'conn-1',
      lessonId: 'lesson-1',
      generation: 2,
      conferenceRequestId: 'request-1',
      title: 'DarSak lesson',
      startAt: '2026-10-25T10:00:00Z',
      endAt: '2026-10-25T11:00:00Z',
    };

    const event = await provider.insertEvent(input);
    const id = JSON.parse(sentBody).id;
    expect(id).toMatch(/^dars[a-f0-9]{64}$/);
    expect(sentUrl).toContain('conferenceDataVersion=1');
    expect(JSON.parse(sentBody).conferenceData.createRequest.requestId).toBe('request-1');
    expect(JSON.parse(sentBody).attendees).toBeUndefined();
    expect(event).toMatchObject({ connectionId: 'conn-1', lessonId: 'lesson-1', generation: 2 });
  });

  it('classifies event conflict for caller reconciliation and rejects automatic redirects', async () => {
    const conflict = providerWith(
      vi.fn<typeof fetch>().mockResolvedValue(ok({ error: { message: 'sensitive body' } }, 409)),
    );
    await expect(
      conflict.insertEvent({
        accessToken: 'access',
        namespace: 'n',
        connectionId: 'c',
        lessonId: 'l',
        generation: 1,
        conferenceRequestId: 'r',
        title: 'lesson',
        startAt: '2026-10-25T10:00:00Z',
        endAt: '2026-10-25T11:00:00Z',
      }),
    ).rejects.toMatchObject({ code: 'conflict', retryable: false });

    const redirect = providerWith(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } }),
        ),
    );
    await expect(redirect.getEvent('access', 'eventid')).rejects.toBeInstanceOf(
      GoogleProviderError,
    );
  });

  it('patches the existing event and treats an already missing delete as success', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ id: 'eventid', status: 'confirmed' }))
      .mockResolvedValueOnce(ok({}, 404));
    const provider = providerWith(fetchImpl);

    const patched = await provider.patchEvent('access', 'eventid', {
      title: 'Updated lesson',
      startAt: '2026-10-25T12:00:00Z',
      endAt: '2026-10-25T13:00:00Z',
      conferenceRequestId: 'retry-request-2',
    });
    await expect(provider.deleteEvent('access', 'eventid')).resolves.toBeUndefined();

    expect(patched.id).toBe('eventid');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/events/eventid?conferenceDataVersion=1');
    expect(fetchImpl.mock.calls[0][1]?.method).toBe('PATCH');
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).conferenceData.createRequest.requestId,
    ).toBe('retry-request-2');
    expect(fetchImpl.mock.calls[1][1]?.method).toBe('DELETE');
  });

  it('maps 429 and timed out requests to safe retryable errors', async () => {
    const rateLimited = providerWith(vi.fn<typeof fetch>().mockResolvedValue(ok({}, 429)));
    await expect(rateLimited.revokeToken('secret')).rejects.toMatchObject({
      code: 'temporarily_unavailable',
      retryable: true,
    });

    const never = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    await expect(providerWith(never).revokeToken('secret')).rejects.toMatchObject({
      code: 'temporarily_unavailable',
      retryable: true,
    });
  });

  it('rejects malformed or non-Google Meet URLs', async () => {
    const provider = providerWith(vi.fn<typeof fetch>());
    await expect(provider.validateMeetUri('https://meet.google.com/abc-defg-hij')).resolves.toBe(
      'https://meet.google.com/abc-defg-hij',
    );
    for (const url of [
      'https://meet.google.com.evil.test/abc-defg-hij',
      'https://example.com/abc-defg-hij',
      'javascript:alert(1)',
      'not a url',
      'https://meet.google.com/abc',
    ]) {
      await expect(provider.validateMeetUri(url)).rejects.toMatchObject({ code: 'unsupported' });
    }
    const malformedEvent = providerWith(
      vi.fn<typeof fetch>().mockResolvedValue(
        ok({
          id: 'eventid',
          conferenceData: {
            entryPoints: [
              { entryPointType: 'video', uri: 'https://meet.google.com.evil.test/abc-defg-hij' },
            ],
          },
        }),
      ),
    );
    await expect(malformedEvent.getEvent('access', 'eventid')).rejects.toMatchObject({
      code: 'unsupported',
    });
  });
});
