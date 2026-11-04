'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type InstallCopy = {
  installLabel: string;
  preparing: string;
  installed: string;
  dismissed: string;
  iosInstructions: string;
  browserInstructions: string;
  error: string;
};

export function InstallControl({ locale, copy }: { locale: 'ar' | 'en'; copy: InstallCopy }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const installed = () => setMessage(copy.installed);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, [copy.installed]);

  async function prepareInstall() {
    setMessage(copy.preparing);
    try {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      }
      if (installPrompt) {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setMessage(choice.outcome === 'accepted' ? copy.installed : copy.dismissed);
        setInstallPrompt(null);
      } else {
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
        setMessage(isIos ? copy.iosInstructions : copy.browserInstructions);
      }
    } catch {
      setMessage(copy.error);
    }
  }

  return (
    <div
      className="grid justify-items-start gap-3"
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <button
        type="button"
        onClick={prepareInstall}
        className="inline-flex min-h-12 items-center rounded-xl bg-teal px-5 py-3 font-bold text-white hover:bg-teal-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
      >
        {copy.installLabel}
      </button>
      {message && (
        <p role="status" aria-live="polite" className="max-w-prose text-sm leading-6 text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
