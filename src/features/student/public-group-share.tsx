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
  const url = origin ? new URL(`/${locale}/groups/${encodeURIComponent(groupId)}`, origin).toString() : '';
  const [feedback, setFeedback] = useState<'copied' | 'shared' | 'manual' | 'error' | null>(null);
  const copy = ar
    ? { label: 'رابط المجموعة العامة', share: 'مشاركة', copy: 'نسخ الرابط', copied: 'تم نسخ الرابط.', shared: 'تم فتح المشاركة.', manual: 'حدد الرابط لنسخه.', error: 'تعذرت مشاركة الرابط. حدده وانسخه يدويًا.' }
    : { label: 'Public group link', share: 'Share', copy: 'Copy link', copied: 'Link copied.', shared: 'Share options opened.', manual: 'Select the link to copy it.', error: 'Could not share the link. Select and copy it manually.' };

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

  const feedbackText = feedback === 'copied' ? copy.copied : feedback === 'shared' ? copy.shared : feedback === 'manual' ? copy.manual : feedback === 'error' ? copy.error : '';
  return <section className="mt-6 rounded-xl border border-[#e3d9c8] bg-white/10 p-4" aria-labelledby="share-public-group">
    <h3 id="share-public-group" className="text-sm font-bold">{copy.label}</h3>
    <label className="sr-only" htmlFor="public-group-share-url">{copy.label}</label>
    <input id="public-group-share-url" ref={input} readOnly value={url} onFocus={event => event.currentTarget.select()} dir="ltr" className="mt-2 block w-full min-w-0 rounded-lg border border-white/30 bg-white/10 p-2 text-sm text-cream"/>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={shareLink} disabled={!url} className="inline-flex items-center gap-2 rounded-lg bg-cream px-3 py-2 text-sm font-bold text-teal disabled:opacity-50"><Share2 size={16}/>{copy.share}</button>
      <button type="button" onClick={copyLink} disabled={!url} className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-3 py-2 text-sm font-bold text-cream disabled:opacity-50"><Copy size={16}/>{copy.copy}</button>
    </div>
    {feedbackText && <p className="mt-2 text-sm" role={feedback === 'error' ? 'alert' : 'status'} aria-live="polite">{feedbackText}</p>}
  </section>;
}
