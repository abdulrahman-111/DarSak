'use client';

import { useCallback, useEffect, useRef } from 'react';
import Script from 'next/script';

type TurnstileApi = {
  render: (container: HTMLElement, options: { sitekey: string; language?: string }) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

/**
 * Cloudflare Turnstile widget. Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset.
 * The widget adds its token to the enclosing form as `cf-turnstile-response`.
 * Tokens are single-use: pass a changing `resetSignal` (e.g. the action state) to get a fresh one.
 */
export function Turnstile({ locale, resetSignal }: { locale: 'ar' | 'en'; resetSignal?: unknown }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const render = useCallback(() => {
    if (!siteKey || !container.current || widgetId.current !== null || !window.turnstile) return;
    widgetId.current = window.turnstile.render(container.current, { sitekey: siteKey, language: locale });
  }, [siteKey, locale]);

  useEffect(() => {
    render();
    return () => {
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [render]);

  useEffect(() => {
    if (resetSignal && widgetId.current !== null) window.turnstile?.reset(widgetId.current);
  }, [resetSignal]);

  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render}/>
      <div ref={container} className="min-h-[65px]"/>
    </>
  );
}
