'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SandakPet } from './pet';
import {
  emitSandakSignal,
  SANDAK_CANCEL_EVENT,
  SANDAK_RETRY_EVENT,
  SANDAK_STATUS_EVENT,
  type SandakSource,
  type SandakStatus,
  type SandakStatusDetail,
} from './events';
import { deriveMood } from './mood';
import { pageTypeFor } from './page-type';
import type { SandakCopy } from './copy';
import type { AssistantAccess, AssistantLocale } from '@/features/assistant/domain';

// The panel (guided help, chat and its copy) is a separate chunk, fetched on first open.
const SandakPanel = dynamic(() => import('./panel'), { ssr: false, loading: () => null });

const HIDDEN_KEY = 'sandak:hidden';
const SLEEP_AFTER_MS = 120_000;
const DONE_MS = 2_500;
const TIP_DELAY_MS = 3_000;
const TIP_VISIBLE_MS = 8_000;

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(HIDDEN_KEY, '1');
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* Storage can be blocked; the preference then lasts for this page view only. */
  }
}

function isTyping(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  );
}

export function SandakCompanion({
  locale,
  access,
  aiEnabled,
  copy,
}: {
  locale: AssistantLocale;
  access: AssistantAccess | null;
  aiEnabled: boolean;
  copy: SandakCopy;
}): React.JSX.Element | null {
  const pathname = usePathname();
  const panelId = useId();
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [panelLoaded, setPanelLoaded] = useState(false);
  const [status, setStatus] = useState<SandakStatus>('idle');
  const [doneFlash, setDoneFlash] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [source, setSource] = useState<SandakSource>('chat');
  const petRef = useRef<HTMLButtonElement>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const live = useRef({ open: false, busy: false, sleeping: false });

  const baseMood = deriveMood({ status, doneFlash, sleeping: false });
  const mood = deriveMood({ status, doneFlash, sleeping });

  useEffect(() => {
    live.current = { open, busy: baseMood !== 'idle', sleeping };
  });

  // Restore the remembered preference after hydration (storage is client-only).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readHidden());
  }, []);

  const wake = useCallback(() => setSleeping(false), []);

  // Real request lifecycle, reported by the panels and the teacher draft helper.
  useEffect(() => {
    const onStatus = (event: Event) => {
      const { status: next, source: from } = (event as CustomEvent<SandakStatusDetail>).detail;
      setSource(from);
      clearTimeout(doneTimer.current);
      setDoneFlash(false);
      setDismissed(null);
      setSleeping(false);
      if (next === 'success') {
        setStatus('idle');
        setDoneFlash(true);
        doneTimer.current = setTimeout(() => setDoneFlash(false), DONE_MS);
      } else setStatus(next);
    };
    window.addEventListener(SANDAK_STATUS_EVENT, onStatus);
    return () => {
      window.removeEventListener(SANDAK_STATUS_EVENT, onStatus);
      clearTimeout(doneTimer.current);
    };
  }, []);

  // Sleep after two idle minutes or while the tab is hidden; any interaction wakes it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!live.current.busy && !live.current.open) setSleeping(true);
      }, SLEEP_AFTER_MS);
    };
    const onActivity = () => {
      if (live.current.sleeping) setSleeping(false);
      arm();
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (!live.current.busy) setSleeping(true);
      } else onActivity();
    };
    arm();
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // At most one unprompted tip per page; it never appears while someone is typing.
  useEffect(() => {
    let fade: ReturnType<typeof setTimeout> | undefined;
    const show = setTimeout(() => {
      const state = live.current;
      if (state.open || state.busy || state.sleeping || isTyping()) return;
      setTipVisible(true);
      fade = setTimeout(() => setTipVisible(false), TIP_VISIBLE_MS);
    }, TIP_DELAY_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(fade);
      setTipVisible(false);
    };
  }, [pathname]);

  const openPanel = useCallback(() => {
    setPanelLoaded(true);
    setOpen(true);
    setSleeping(false);
    setTipVisible(false);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    petRef.current?.focus();
  }, []);

  const hide = useCallback(() => {
    writeHidden(true);
    setHidden(true);
    setOpen(false);
  }, []);

  const show = useCallback(() => {
    writeHidden(false);
    setHidden(false);
    setSleeping(false);
    requestAnimationFrame(() => petRef.current?.focus());
  }, []);

  if (hidden === null) return null;

  if (hidden) {
    return (
      <div className="sandak-dock sandak-dock--hidden" data-sandak-companion="hidden">
        <button
          type="button"
          onClick={show}
          className="sandak-restore inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-teal/30 bg-white/90 px-3 text-sm font-bold text-teal shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          {copy.showLabel}
        </button>
      </div>
    );
  }

  const bubble: {
    key: string;
    text: string;
    actions: Array<{ label: string; run: () => void; primary?: boolean }>;
  } | null = (() => {
    if (open || dismissed === mood) return null;
    const later = { label: copy.actionLater, run: () => setDismissed(mood) };
    switch (mood) {
      case 'thinking':
        return {
          key: 'thinking',
          text: copy.bubbleThinking,
          actions: [{ label: copy.actionStop, run: () => emitSandakSignal(SANDAK_CANCEL_EVENT) }],
        };
      case 'needs':
        return {
          key: 'needs',
          text: copy.bubbleNeeds,
          actions: [{ label: copy.actionReview, run: reviewDraft, primary: true }, later],
        };
      case 'done':
        return { key: 'done', text: copy.bubbleDone, actions: [] };
      case 'oops':
        return {
          key: 'oops',
          text: copy.bubbleOops,
          actions: [
            {
              label: copy.actionRetry,
              run: () => {
                // Errors come from a mounted panel, so its retry listener is already attached.
                if (source === 'chat') openPanel();
                emitSandakSignal(SANDAK_RETRY_EVENT);
              },
              primary: true,
            },
            later,
          ],
        };
      default:
        return tipVisible
          ? {
              key: 'idle',
              text: copy.bubbleIdle,
              actions: [{ label: copy.actionAsk, run: openPanel, primary: true }, later],
            }
          : null;
    }
  })();

  function reviewDraft() {
    const target = document.getElementById('group-template-topic');
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.focus();
    } else openPanel();
  }

  const statusText =
    mood === 'thinking'
      ? copy.statusThinking
      : mood === 'needs'
        ? copy.statusNeeds
        : mood === 'done'
          ? copy.statusDone
          : mood === 'oops'
            ? copy.statusOops
            : '';

  return (
    <div
      className="sandak-dock"
      data-sandak-companion="visible"
      data-mood={mood}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>
      {panelLoaded && (
        <SandakPanel
          id={panelId}
          open={open}
          locale={locale}
          access={access}
          aiEnabled={aiEnabled}
          copy={copy}
          pageType={pageTypeFor(pathname)}
          onClose={closePanel}
          onHide={hide}
        />
      )}
      {bubble && (
        <div className="sandak-bubble" data-bubble={bubble.key}>
          <p className="text-sm leading-6 text-ink">{bubble.text}</p>
          {bubble.actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {bubble.actions.map(action => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.run}
                  className={`min-h-11 rounded-xl px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${action.primary ? 'bg-teal text-white' : 'border border-ink/20 bg-white text-ink'}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="sandak-row">
        <button
          type="button"
          onClick={hide}
          aria-label={copy.hideLabel}
          title={copy.hideLabel}
          className="sandak-hide inline-flex size-11 items-center justify-center rounded-full text-ink/60 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-6 items-center justify-center rounded-full bg-white/90 text-base leading-none shadow-xs"
          >
            ×
          </span>
        </button>
        <button
          ref={petRef}
          type="button"
          aria-label={open ? copy.closeLabel : copy.openLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelLoaded ? panelId : undefined}
          title={mood === 'sleep' ? copy.bubbleSleep : undefined}
          onClick={() => {
            wake();
            if (open) closePanel();
            else openPanel();
          }}
          className="sandak-pet-button inline-flex min-h-11 min-w-11 items-end justify-center rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange"
        >
          <SandakPet mood={mood} scale={4} />
        </button>
      </div>
    </div>
  );
}
