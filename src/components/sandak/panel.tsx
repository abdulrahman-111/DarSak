'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GuestHelp } from '@/features/assistant/guest-help';
import { GuidedHelp } from '@/features/assistant/guided-help';
import type {
  AssistantAccess,
  AssistantLocale,
  AssistantPageType,
} from '@/features/assistant/domain';
import type { SandakCopy } from './copy';

/** The SanDai panel: live chat (when configured) and local guided help. Loaded on first open. */
export default function SandakPanel({
  id,
  open,
  locale,
  access,
  aiEnabled,
  copy,
  pageType,
  onClose,
  onHide,
}: {
  id: string;
  open: boolean;
  locale: AssistantLocale;
  access: AssistantAccess | null;
  aiEnabled: boolean;
  copy: SandakCopy;
  pageType: AssistantPageType;
  onClose: () => void;
  onHide: () => void;
}): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [draftHelper, setDraftHelper] = useState(false);
  const canDraft = access?.role === 'teacher' && access.canTeach && aiEnabled;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftHelper(!!document.getElementById('group-template-topic'));
  }, [open]);

  return (
    <section
      id={id}
      role="dialog"
      aria-modal="false"
      aria-label={copy.panelTitle}
      hidden={!open}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className="sandak-panel"
    >
      <header className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <h2 className="text-base font-bold text-teal">{copy.panelTitle}</h2>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onHide}
            className="min-h-11 rounded-xl px-3 text-sm font-semibold text-ink/70 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            {copy.hideLabel}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={copy.panelClose}
            className="inline-flex size-11 items-center justify-center rounded-full border border-ink/15 bg-white text-ink hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        onClick={event => {
          if (event.target instanceof HTMLElement && event.target.closest('a')) onClose();
        }}
      >
        {canDraft && draftHelper && (
          <button
            type="button"
            onClick={() => {
              const target = document.getElementById('group-template-topic');
              onClose();
              target?.scrollIntoView({ block: 'center' });
              target?.focus();
            }}
            className="mb-4 min-h-11 w-full rounded-xl border border-teal px-4 text-sm font-bold text-teal"
          >
            {copy.actionDraft}
          </button>
        )}
        {access ? (
          <GuidedHelp locale={locale} access={access} aiEnabled={aiEnabled} pageType={pageType} />
        ) : (
          <GuestHelp locale={locale} />
        )}
      </div>
    </section>
  );
}
