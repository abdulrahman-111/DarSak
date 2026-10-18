'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Locale } from '@/features/student/domain';

const messages = {
  en: { indicator: 'You have unsaved profile changes.', confirm: 'You have unsaved profile changes. Leave this page and discard them?' },
  ar: { indicator: 'لديك تغييرات غير محفوظة في الملف الشخصي.', confirm: 'لديك تغييرات غير محفوظة في الملف الشخصي. هل تريد مغادرة الصفحة وإهمالها؟' },
} as const;

type ContextValue = { setDirty: (key: string, dirty: boolean) => void };
const DirtyContext = createContext<ContextValue | null>(null);

export function UnsavedProfileProtection({ locale, children, kind = 'profile' }: { locale: Locale; children: ReactNode; kind?: 'profile'|'group' }) {
  const text = kind === 'group' ? (locale === 'ar' ? { indicator: 'لديك تغييرات غير محفوظة في المجموعة.', confirm: 'لديك تغييرات غير محفوظة في المجموعة. هل تريد المغادرة وإهمالها؟' } : { indicator: 'You have unsaved group changes.', confirm: 'You have unsaved group changes. Leave and discard them?' }) : messages[locale];
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({});
  const approvedNavigation = useRef(false);
  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtySections(current => current[key] === dirty ? current : { ...current, [key]: dirty });
  }, []);
  const dirty = Object.values(dirtySections).some(Boolean);
  const context = useMemo(() => ({ setDirty }), [setDirty]);

  useEffect(() => {
    const approveImmediateNavigation = () => {
      approvedNavigation.current = true;
      window.setTimeout(() => { approvedNavigation.current = false; }, 0);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (approvedNavigation.current) {
        approvedNavigation.current = false;
        return;
      }
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      let destination: URL;
      try { destination = new URL(anchor.href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm(text.confirm)) event.preventDefault();
      else approveImmediateNavigation();
    };
    const confirmFormSubmit = (event: SubmitEvent) => {
      if (!dirty || event.defaultPrevented || !(event.target instanceof HTMLFormElement) || !event.target.hasAttribute('data-confirm-unsaved-navigation')) return;
      if (!window.confirm(text.confirm)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        approveImmediateNavigation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', confirmNavigation, true);
    document.addEventListener('submit', confirmFormSubmit, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', confirmNavigation, true);
      document.removeEventListener('submit', confirmFormSubmit, true);
    };
  }, [dirty, text.confirm]);

  return <DirtyContext.Provider value={context}>
    {dirty && <p role="status" className="mb-4 rounded-xl border border-orange/30 bg-orange/10 p-3 text-sm font-bold text-ink" dir={locale === 'ar' ? 'rtl' : 'ltr'}>{text.indicator}</p>}
    {children}
  </DirtyContext.Provider>;
}

export function useUnsavedProfileSection(key: string, dirty: boolean) {
  const context = useContext(DirtyContext);
  useEffect(() => {
    context?.setDirty(key, dirty);
    return () => context?.setDirty(key, false);
  }, [context, key, dirty]);
}
