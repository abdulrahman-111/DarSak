'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { Share2, Copy } from 'lucide-react';
import type { Locale } from './domain';

const subscribeToOrigin = () => () => {};
const currentOrigin = () => window.location.origin;
const serverOrigin = () => '';

export function PublicGroupShare({ locale, groupId }: { locale: Locale; groupId: string }) {
  const ar = locale === 'ar';
  const input = useRef<HTMLInputElement>(null);
  const origin = useSyncExternalStore(subscribeToOrigin, currentOrigin, serverOrigin);
  const url = origin
    ? new URL(`/${locale}/groups/${encodeURIComponent(groupId)}`, origin).toString()
    : '';
  const [feedback, setFeedback] = useState<'copied' | 'shared' | 'manual' | 'error' | null>(null);
  const copy = ar
    ? {
        label: 'رابط المجموعة العامة',
        helper: 'يمكن لأي شخص لديه هذا الرابط مشاهدة المجموعة؛ سجّل الدخول لطلب الانضمام.',
        share: 'مشاركة',
        copy: 'نسخ الرابط',
        copied: 'تم نسخ الرابط.',
        shared: 'تم فتح المشاركة.',
        manual: 'حدد الرابط لنسخه.',
        error: 'تعذرت مشاركة الرابط. حدده وانسخه يدويًا.',
      }
    : {
        label: 'Public group link',
        helper: 'Anyone with this link can view the group; sign in to request enrollment.',
        share: 'Share',
        copy: 'Copy link',
        copied: 'Link copied.',
        shared: 'Share options opened.',
        manual: 'Select the link to copy it.',
        error: 'Could not share the link. Select and copy it manually.',
      };

  const copyLink = async () => {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        input.current?.select();
        if (!document.execCommand('copy')) throw new Error('copy unavailable');
      }
      setFeedback('copied');
    } catch {
      input.current?.select();
      setFeedback('manual');
    }
  };

  const shareLink = async () => {
    if (!url) return;
    if (!navigator.share) return copyLink();
    try {
      await navigator.share({ url });
      setFeedback('shared');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFeedback('error');
    }
  };

  const feedbackText =
    feedback === 'copied'
      ? copy.copied
      : feedback === 'shared'
        ? copy.shared
        : feedback === 'manual'
          ? copy.manual
          : feedback === 'error'
            ? copy.error
            : '';
  return (
    <section
      className="mt-6 rounded-xl border border-line bg-cream p-4 text-[#29251f]"
      aria-labelledby="share-public-group"
    >
      <h3 id="share-public-group" className="text-sm font-bold text-teal">
        {copy.label}
      </h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{copy.helper}</p>
      <label className="sr-only" htmlFor="public-group-share-url">
        {copy.label}
      </label>
      <input
        id="public-group-share-url"
        ref={input}
        readOnly
        value={url}
        title={url || undefined}
        onFocus={event => event.currentTarget.select()}
        dir="ltr"
        className="mt-2 block min-h-11 w-full min-w-0 rounded-lg border border-[#b8aa95] bg-white px-3 py-2 text-left font-mono text-sm text-[#29251f] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={shareLink}
          disabled={!url}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white transition hover:bg-[#164d47] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Share2 size={16} />
          {copy.share}
        </button>
        <button
          type="button"
          onClick={copyLink}
          disabled={!url}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#748178] bg-white px-4 py-2 text-sm font-bold text-[#29251f] transition hover:bg-[#eee7da] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Copy size={16} />
          {copy.copy}
        </button>
      </div>
      {feedbackText && (
        <p
          className="mt-2 text-sm text-[#315b3d]"
          role={feedback === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedbackText}
        </p>
      )}
    </section>
  );
}
