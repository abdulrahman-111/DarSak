'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { GuidedHelp } from './guided-help';
import type { AssistantAccess, AssistantLocale } from './domain';

export function HelpDrawer({
  locale,
  access,
}: {
  locale: AssistantLocale;
  access: AssistantAccess | null;
}): React.JSX.Element {
  const pathname = usePathname();
  const panelKey = `${pathname}:${access?.role ?? 'guest'}:${access?.canTeach ?? false}`;
  return <HelpDrawerPanel key={panelKey} locale={locale} access={access} />;
}

function HelpDrawerPanel({
  locale,
  access,
}: {
  locale: AssistantLocale;
  access: AssistantAccess | null;
}): React.JSX.Element {
  const ar = locale === 'ar';
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const hasAccess = access !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus();

    const controller = new AbortController();
    if (hasAccess) {
      fetch('/api/assistant', { signal: controller.signal })
        .then(response => (response.ok ? response.json() : null))
        .then(result => {
          if (!controller.signal.aborted) setAvailable(result?.available === true);
        })
        .catch(() => {
          if (!controller.signal.aborted) setAvailable(false);
        });
    }

    return () => {
      if (dialog.open) dialog.close();
      controller.abort();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [hasAccess, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-label={ar ? 'فتح سند' : 'Open Sanad'}
        title={ar ? 'فتح سند · المساعدة' : 'Open Sanad · Help'}
        onClick={() => setOpen(true)}
        className="sanad-launcher fixed z-30 inline-flex size-14 items-center justify-center rounded-full border border-teal/15 bg-teal text-cream shadow-lg transition-[transform,background-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-teal/95 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange"
      >
        <MessageCircle className="size-6" aria-hidden="true" />
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        dir={ar ? 'rtl' : 'ltr'}
        aria-label={ar ? 'مساعدة سند' : 'Sanad help'}
        onClose={() => setOpen(false)}
        onClick={event => {
          if (event.target instanceof HTMLElement && event.target.closest('a')) setOpen(false);
        }}
        className="m-0 h-dvh max-h-dvh w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-ink/35 open:flex open:justify-end"
      >
        {open && (
          <div className="flex h-full w-full max-w-xl flex-col bg-cream shadow-2xl sm:m-4 sm:h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border sm:border-white/60">
            <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-teal">
                  {ar ? 'سند · مساعدة درسك' : 'Sanad · DarSak help'}
                </p>
                <h2 className="mt-1 text-xl font-bold text-ink">
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
              {access ? (
                <GuidedHelp locale={locale} access={access} available={available} open={open} />
              ) : (
                <GuestHelp locale={locale} />
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

export function GuestHelp({ locale }: { locale: AssistantLocale }): React.JSX.Element {
  const ar = locale === 'ar';
  const links = [
    { href: `/${locale}/help`, label: ar ? 'المساعدة العامة' : 'Public help' },
    { href: `/${locale}/login`, label: ar ? 'تسجيل الدخول' : 'Sign in' },
    { href: `/${locale}/register`, label: ar ? 'إنشاء حساب' : 'Create an account' },
  ];

  return (
    <section className="space-y-4" aria-label={ar ? 'مساعدة سند' : 'Sanad help'}>
      <p className="text-sm leading-6 text-ink/75">
        {ar
          ? 'يمكنك تصفح المساعدة العامة، أو تسجيل الدخول للوصول إلى الإرشادات المناسبة لحسابك.'
          : 'Browse public help, or sign in to see guidance for your account.'}
      </p>
      <p className="rounded-xl bg-mint/50 px-3 py-2 text-sm leading-6 text-ink/75" role="note">
        {ar
          ? 'للمساعدة بشأن حسابك، سجّل الدخول أولاً ثم أرسل بلاغاً من صفحة الإبلاغ عن مشكلة.'
          : 'For account help, sign in first and send a report from the Report a problem page.'}
      </p>
      <nav aria-label={ar ? 'خيارات المساعدة' : 'Help options'} className="flex flex-wrap gap-2">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
