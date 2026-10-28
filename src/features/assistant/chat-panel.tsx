'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  emitSandakStatus,
  SANDAK_CANCEL_EVENT,
  SANDAK_RETRY_EVENT,
} from '@/components/sandak/events';
import type { AssistantLocale, AssistantPageType } from './domain';

type Message = { role: 'user' | 'assistant'; text: string };

export function buildChatRequestMessages(messages: Message[], userText: string): Message[] {
  const history = messages.filter(message => message.text.length <= 2000).slice(-7);
  let budget = 8000 - userText.length;
  const recent: Message[] = [];
  for (const message of [...history].reverse()) {
    if (recent.length === 7) break;
    if (message.text.length > budget) continue;
    recent.unshift(message);
    budget -= message.text.length;
  }
  return [...recent, { role: 'user', text: userText }];
}

export function ChatPanel({
  locale,
  available,
  pageType,
}: {
  locale: AssistantLocale;
  available: boolean | null;
  pageType?: AssistantPageType;
}) {
  const ar = locale === 'ar';
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const cancelRequested = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const t = ar
    ? {
        intro:
          'أنا سنداي، مساعد درسك. اسأل عن المنصة أو اطلب شرحًا دراسيًا أو أمثلة أو مساعدة في التخطيط.',
        unavailable: 'المساعدة المباشرة غير متاحة الآن. يمكنك استخدام الإرشادات المحلية.',
        notice:
          'يُرسل نص رسالتك إلى خدمة Gemini من Google لكتابة الرد. من فضلك لا تضف معلومات شخصية أو خاصة أو حساسة.',
        question: 'رسالتك',
        send: 'إرسال',
        cancel: 'إلغاء الطلب',
        clear: 'مسح المحادثة',
        placeholder: 'اكتب سؤالك…',
        errors: 'تعذر إرسال السؤال. حاول مرة أخرى.',
        rateLimited: 'أرسلت طلبات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
        provider: 'المساعدة المباشرة غير متاحة مؤقتًا. حاول لاحقًا.',
        context: 'قد لا تُرسل الردود الطويلة والرسائل القديمة ضمن سياق السؤال التالي.',
        loading: 'جارٍ إعداد الإجابة…',
      }
    : {
        intro:
          "I'm SanDai, DarSak's assistant. Ask about the platform, request a study explanation or examples, or get help planning.",
        unavailable: 'Live help is unavailable right now. You can use local guidance.',
        notice:
          'Your message is sent to Google’s Gemini service to write a reply. Please do not include personal, private or sensitive information.',
        question: 'Your message',
        send: 'Send',
        cancel: 'Cancel request',
        clear: 'Clear conversation',
        placeholder: 'Type your question…',
        errors: 'The question could not be sent. Please try again.',
        rateLimited: 'Too many requests. Wait a moment, then try again.',
        provider: 'Live help is temporarily unavailable. Please try again later.',
        context: 'Long replies and older messages may be left out of the next question’s context.',
        loading: 'Preparing an answer…',
      };

  async function send(clean: string) {
    if (!available || !clean || loading) return;
    const userMessage = { role: 'user' as const, text: clean };
    // Longer model replies remain visible locally but are omitted from future context.
    const payloadMessages = buildChatRequestMessages(messages, clean);
    setMessages(current => [...current, userMessage]);
    setText('');
    setError('');
    setLoading(true);
    emitSandakStatus('pending');
    cancelRequested.current = false;
    const request = new AbortController();
    controller.current = request;
    let failureCode = '';
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        signal: request.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          locale,
          ...(pageType ? { page: pageType } : {}),
          messages: payloadMessages,
        }),
      });
      const result = await response.json();
      if (
        !response.ok ||
        result?.ok !== true ||
        result.mode !== 'chat' ||
        typeof result.text !== 'string' ||
        result.text.length > 6000
      ) {
        const code = result?.code;
        failureCode = code;
        throw new Error(
          code === 'rate_limited'
            ? 'rate_limited'
            : code === 'provider_unavailable'
              ? 'provider_unavailable'
              : 'request_failed',
        );
      }
      if (alive.current && !request.signal.aborted) {
        setMessages(current => [...current, { role: 'assistant', text: result.text }]);
        emitSandakStatus('success');
      }
    } catch {
      if (alive.current && !request.signal.aborted) {
        emitSandakStatus('error');
        setMessages(current => current.slice(0, -1));
        setText(clean);
        setError(
          failureCode === 'rate_limited'
            ? t.rateLimited
            : failureCode === 'provider_unavailable'
              ? t.provider
              : t.errors,
        );
      } else if (alive.current && cancelRequested.current) {
        setMessages(current => current.slice(0, -1));
        setText(clean);
        setError('');
        emitSandakStatus('idle');
      }
    } finally {
      if (alive.current) setLoading(false);
      if (controller.current === request) controller.current = null;
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(text.trim());
  }

  // The docked companion can stop or retry a request while this panel stays mounted.
  const actions = useRef({ stop: () => {}, retry: () => {} });
  useEffect(() => {
    actions.current = {
      stop: () => {
        cancelRequested.current = true;
        controller.current?.abort();
      },
      retry: () => void send(text.trim()),
    };
  });
  useEffect(() => {
    const stop = () => actions.current.stop();
    const retry = () => actions.current.retry();
    window.addEventListener(SANDAK_CANCEL_EVENT, stop);
    window.addEventListener(SANDAK_RETRY_EVENT, retry);
    return () => {
      window.removeEventListener(SANDAK_CANCEL_EVENT, stop);
      window.removeEventListener(SANDAK_RETRY_EVENT, retry);
    };
  }, []);

  return (
    <section className="grid gap-4" aria-label={ar ? 'محادثة سنداي' : 'SanDai chat'}>
      <p className="text-sm leading-6 text-ink/75">{t.intro}</p>
      {available !== true ? (
        <p className="rounded-xl bg-mint/50 px-3 py-2 text-sm leading-6 text-ink/75" role="status">
          {t.unavailable}
        </p>
      ) : (
        <>
          <p className="rounded-xl bg-mint/50 px-3 py-2 text-xs leading-5 text-ink/80" role="note">
            {t.notice}
          </p>
          <div className="grid gap-3" aria-live="polite">
            {messages.map((message, index) => (
              <p
                key={`${index}-${message.role}`}
                dir="auto"
                className={`whitespace-pre-wrap break-words rounded-2xl p-3 text-sm leading-6 ${message.role === 'assistant' ? 'bg-white' : 'bg-teal/10'}`}
              >
                {message.text}
              </p>
            ))}
          </div>
          {messages.some(message => message.role === 'assistant' && message.text.length > 2000) && (
            <p className="text-xs leading-5 text-muted">{t.context}</p>
          )}
          {loading && (
            <p role="status" aria-live="polite" className="text-sm text-muted">
              {t.loading}
            </p>
          )}
          <form onSubmit={submit} className="grid gap-2">
            <label htmlFor="sanad-chat-message" className="text-sm font-bold">
              {t.question} <span className="font-normal text-muted">{text.length} / 2,000</span>
            </label>
            <textarea
              id="sanad-chat-message"
              value={text}
              onChange={event => setText(event.target.value.slice(0, 2000))}
              maxLength={2000}
              rows={3}
              dir="auto"
              placeholder={t.placeholder}
              disabled={loading}
              className="w-full rounded-xl border border-ink/20 bg-white p-3 text-sm disabled:opacity-60"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!text.trim() || loading}
                className="min-h-11 rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:opacity-50"
              >
                {t.send}
              </button>
              {loading && (
                <button
                  type="button"
                  onClick={() => actions.current.stop()}
                  className="min-h-11 rounded-xl border px-4 py-2"
                >
                  {t.cancel}
                </button>
              )}
              {messages.length > 0 && !loading && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setError('');
                  }}
                  className="min-h-11 rounded-xl border px-4 py-2"
                >
                  {t.clear}
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
