'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GuidedHelp } from './guided-help';
import type { AssistantAccess, AssistantLocale } from './domain';

export function HelpDrawer({
  locale,
  access,
}: {
  locale: AssistantLocale;
  access: AssistantAccess;
}): React.JSX.Element {
  const ar = locale === 'ar';
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus();

    const controller = new AbortController();
    setAvailable(null);
    fetch('/api/assistant', { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(result => {
        if (!controller.signal.aborted) setAvailable(result?.available === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });

    return () => {
      if (dialog.open) dialog.close();
      controller.abort();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm transition-colors hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
      >
        <span aria-hidden="true">?</span>
        {ar ? 'سند · المساعدة' : 'Sanad · Help'}
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        dir={ar ? 'rtl' : 'ltr'}
        aria-labelledby="guided-help-title"
        onClose={() => setOpen(false)}
        onClick={event => {
          if (event.target instanceof HTMLElement && event.target.closest('a')) setOpen(false);
        }}
        className="m-0 h-dvh max-h-dvh w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-ink/35 open:flex open:justify-end"
      >
        <div className="flex h-full w-full max-w-xl flex-col bg-cream shadow-2xl sm:m-4 sm:h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border sm:border-white/60">
          <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-teal">
                {ar ? 'سند · مساعدة درسك' : 'Sanad · DarSak help'}
              </p>
              <h2 id="guided-help-title" className="mt-1 text-xl font-bold text-ink">
                {ar ? 'المساعدة الموجّهة' : 'Guided platform help'}
              </h2>
            </div>
            <button
              type="button"
              data-dialog-close
              onClick={() => dialogRef.current?.close()}
              aria-label={ar ? 'إغلاق المساعدة' : 'Close help'}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-white text-ink hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <GuidedHelp locale={locale} access={access} available={available} open={open} />
          </div>
        </div>
      </dialog>
    </>
  );
}
