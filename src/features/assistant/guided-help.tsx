'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { findGuidanceTopics, getGuidanceTopics } from './guidance';
import type { GuidanceTopic } from './guidance';
import type { AssistantAccess, AssistantLocale, AssistantPageType } from './domain';
import { ChatPanel } from './chat-panel';

export function GuidedHelp({
  locale,
  access,
  aiEnabled = false,
  pageType,
}: {
  locale: AssistantLocale;
  access: AssistantAccess;
  /** True when live SanDak chat is configured for this signed-in student or teacher. */
  aiEnabled?: boolean;
  pageType?: AssistantPageType;
}): React.JSX.Element {
  const ar = locale === 'ar';
  const topics = useMemo(() => getGuidanceTopics(locale, access), [locale, access]);
  const [question, setQuestion] = useState('');
  const [matches, setMatches] = useState<GuidanceTopic[] | null>(null);
  const [selected, setSelected] = useState<GuidanceTopic | null>(null);
  const [tab, setTab] = useState<'chat' | 'local'>(aiEnabled ? 'chat' : 'local');

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelected(null);
    setMatches(findGuidanceTopics(question.slice(0, 160), locale, access));
  }

  const shownTopics = matches === null || matches.length === 0 ? topics : matches;

  return (
    <section className="space-y-5" aria-label={ar ? 'مساعدة سندك' : 'SanDak help'}>
      {aiEnabled && (
        <div role="tablist" aria-label={ar ? 'نوع المساعدة' : 'Help type'} className="flex gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            onClick={() => setTab('chat')}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-bold ${tab === 'chat' ? 'border-teal bg-teal text-white' : 'border-ink/15 bg-white text-ink'}`}
          >
            {ar ? 'سندك' : 'SanDak'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'local'}
            onClick={() => setTab('local')}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-bold ${tab === 'local' ? 'border-teal bg-teal text-white' : 'border-ink/15 bg-white text-ink'}`}
          >
            {ar ? 'إرشادات محلية' : 'Local help'}
          </button>
        </div>
      )}
      {aiEnabled && (
        // Kept mounted so a running request and the conversation survive tab switches.
        <div hidden={tab !== 'chat'}>
          <ChatPanel locale={locale} available={aiEnabled} pageType={pageType} />
        </div>
      )}
      {tab === 'local' && (
        <div className="space-y-5">
          <div>
            <p className="text-sm leading-6 text-ink/75">
              {ar
                ? 'اسأل عن استخدام درسك، وسأبحث في إرشادات المنصة المتاحة لهذا الحساب.'
                : 'Ask how to use DarSak and browse platform guidance available for this account.'}
            </p>
            <p
              className="mt-2 rounded-xl bg-mint/50 px-3 py-2 text-xs leading-5 text-ink/75"
              role="note"
            >
              {ar
                ? 'هذه إرشادات محلية وقوالب موجّهة. لا تستخدم ذكاءً اصطناعيًا مباشرًا.'
                : 'These local guidance topics run on this device and do not use live AI.'}
            </p>
          </div>

          <form onSubmit={search} className="space-y-2">
            <label htmlFor="guided-help-question" className="block text-sm font-bold text-ink">
              {ar ? 'ما الذي تريد المساعدة فيه؟' : 'What would you like help with?'}
            </label>
            <div className="flex gap-2">
              <input
                id="guided-help-question"
                value={question}
                maxLength={160}
                onChange={event => setQuestion(event.target.value.slice(0, 160))}
                dir="auto"
                className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                placeholder={
                  ar ? 'مثال: كيف أغيّر كلمة المرور؟' : 'For example: How do I change my password?'
                }
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-teal px-4 py-2 text-sm font-bold text-cream hover:bg-teal/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              >
                {ar ? 'بحث' : 'Ask'}
              </button>
            </div>
          </form>

          {selected ? (
            <article className="rounded-2xl border border-ink/10 bg-white p-4" aria-live="polite">
              <h3 className="font-bold text-ink">{selected.title}</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink/80">
                {selected.answer}
              </p>
              {selected.links.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {selected.links.map(link => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="inline-flex rounded-full bg-teal/10 px-3 py-1.5 text-sm font-semibold text-teal underline-offset-2 hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ) : (
            <div aria-live="polite" className="space-y-2">
              <h3 className="text-sm font-bold text-ink">
                {matches === null
                  ? ar
                    ? 'المواضيع المتاحة'
                    : 'Available topics'
                  : matches.length > 0
                    ? ar
                      ? 'مواضيع ذات صلة'
                      : 'Related topics'
                    : ar
                      ? 'لم نعثر على تطابق'
                      : 'No matching topic found'}
              </h3>
              {matches?.length === 0 && (
                <p className="text-sm leading-6 text-ink/75">
                  {ar
                    ? 'جرّب سؤالًا آخر أو اختر أحد المواضيع المتاحة أدناه.'
                    : 'Try another question or choose one of the available topics below.'}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {shownTopics.map(topic => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      setSelected(topic);
                      setMatches(null);
                    }}
                    className="rounded-full border border-ink/15 bg-white px-3 py-2 text-start text-sm font-semibold text-ink hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                  >
                    {topic.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
