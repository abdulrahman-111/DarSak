import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateChat, generateGroupDraft } from '@/features/assistant/provider';
import { ProviderSafetyBlockedError } from '@/features/assistant/provider-errors';

const chat = {
  mode: 'chat' as const,
  locale: 'en' as const,
  messages: [{ role: 'user' as const, text: 'Explain fractions with an example.' }],
};
const candidate = (text: string, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
});
const response = (value: unknown) =>
  new Response(typeof value === 'string' ? value : JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Gemini provider response validation', () => {
  it('uses the fixed endpoint and sends the key only in its header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(candidate('A fraction shows equal parts of a whole.')));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateChat('server-secret', chat)).resolves.toContain('fraction');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('server-secret');
    expect(url).not.toContain('server-secret');
    const sent = JSON.parse(String(init.body));
    expect(sent.systemInstruction.parts[0].text).toContain('study explanations');
    expect(sent.generationConfig.maxOutputTokens).toBe(2048);
    expect(sent.generationConfig.thinkingConfig).toBeUndefined();
    expect(sent.safetySettings).toEqual([
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ]);
  });

  it('sends only the typed messages plus minimal non-sensitive session context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(candidate('Sure.')));
    vi.stubGlobal('fetch', fetchMock);
    await generateChat('k', { ...chat, page: 'group' }, '', undefined, { role: 'student' });
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.systemInstruction.parts[0].text).toContain(
      'role=student; locale=en; page type=group',
    );
    expect(sent.contents).toEqual([
      { role: 'user', parts: [{ text: 'Explain fractions with an example.' }] },
    ]);
    expect(sent.tools).toBeUndefined();
  });

  it.each([
    ['malformed response JSON', '{'],
    ['truncated candidate', candidate('partial', 'MAX_TOKENS')],
  ])('rejects %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
    await expect(generateChat('server-secret', chat)).rejects.toThrow();
  });

  it.each([
    ['prompt-level', { promptFeedback: { blockReason: 'SAFETY' } }],
    ['candidate-level', candidate('blocked', 'SAFETY')],
    [
      'candidate ratings',
      {
        candidates: [
          {
            finishReason: 'STOP',
            safetyRatings: [
              { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH', blocked: true },
            ],
            content: { parts: [{ text: 'blocked' }] },
          },
        ],
      },
    ],
  ])(
    'types %s safety blocks for the existing localized provider-unavailable contract',
    async (_label, payload) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
      await expect(generateChat('server-secret', chat)).rejects.toBeInstanceOf(
        ProviderSafetyBlockedError,
      );
    },
  );

  it.each([
    ['function call with text', { functionCall: { name: 'lookup', args: {} }, text: 'answer' }],
    [
      'multimodal part with text',
      { inlineData: { mimeType: 'image/png', data: 'AA==' }, text: 'answer' },
    ],
    [
      'code execution part',
      { executableCode: { language: 'PYTHON', code: 'print(1)' }, text: 'answer' },
    ],
  ])('rejects unsupported candidate part: %s', async (_label, part) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ candidates: [{ finishReason: 'STOP', content: { parts: [part] } }] }),
        ),
    );
    await expect(generateChat('server-secret', chat)).rejects.toThrow('provider failure');
  });

  it('accepts ordinary text with Gemini thought signature metadata but never exposes the metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { text: 'A fraction has equal parts.', thoughtSignature: 'opaque-signature' },
                ],
              },
            },
          ],
        }),
      ),
    );
    await expect(generateChat('server-secret', chat)).resolves.toBe('A fraction has equal parts.');
  });

  it('rejects thought text even when it accompanies an otherwise valid answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: 'internal', thought: true }] } },
          ],
        }),
      ),
    );
    await expect(generateChat('server-secret', chat)).rejects.toThrow('provider failure');
  });

  it('rejects provider bodies over 64 KiB', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(' '.repeat(65 * 1024))));
    await expect(generateChat('server-secret', chat)).rejects.toThrow();
  });

  it('turns provider HTTP failures into a generic rejected operation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private provider detail', { status: 429 })),
    );
    await expect(generateChat('server-secret', chat)).rejects.toThrow('provider failure');
  });

  it('aborts a stalled provider call at the fixed 20-second deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = generateChat('server-secret', chat);
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('rejects malformed or extra-field structured drafts after provider generation', async () => {
    const draftRequest = {
      mode: 'group_draft' as const,
      locale: 'en' as const,
      topic: 'Algebra',
      level: 'beginner' as const,
      format: 'online' as const,
      guidance: '',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(candidate('{not json}'))));
    await expect(generateGroupDraft('server-secret', draftRequest)).rejects.toThrow();
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        candidate(
          JSON.stringify({
            name: 'Algebra',
            description: '',
            outcomes: '',
            prerequisites: '',
            extra: 'denied',
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateGroupDraft('server-secret', draftRequest)).rejects.toThrow();
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    expect(sent.generationConfig.responseSchema.required).toEqual([
      'name',
      'description',
      'outcomes',
      'prerequisites',
    ]);
  });

  it('accepts a valid four-field structured draft after schema validation', async () => {
    const draftRequest = {
      mode: 'group_draft' as const,
      locale: 'ar' as const,
      topic: 'جبر',
      level: 'beginner' as const,
      format: 'online' as const,
      guidance: '',
    };
    const expected = {
      name: 'الجبر',
      description: 'مقدمة',
      outcomes: 'حل معادلات بسيطة',
      prerequisites: '',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(candidate(JSON.stringify(expected)))),
    );
    await expect(generateGroupDraft('server-secret', draftRequest)).resolves.toEqual(expected);
  });
});
