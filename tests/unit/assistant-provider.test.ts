import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateChat, generateGroupDraft } from '@/features/assistant/provider';

const chat = {
  mode: 'chat' as const,
  locale: 'en' as const,
  acknowledged: true as const,
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
  });

  it.each([
    ['malformed response JSON', '{'],
    ['prompt-level safety block', { promptFeedback: { blockReason: 'SAFETY' } }],
    ['candidate safety block', candidate('blocked', 'SAFETY')],
    ['truncated candidate', candidate('partial', 'MAX_TOKENS')],
  ])('rejects %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)));
    await expect(generateChat('server-secret', chat)).rejects.toThrow();
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
      acknowledged: true as const,
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
      acknowledged: true as const,
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
