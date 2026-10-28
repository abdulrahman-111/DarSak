'use client';

import { useViewerState } from '@/components/viewer-state';
import { SandakCompanion } from './companion';
import type { SandakCopy } from './copy';
import type { AssistantLocale } from '@/features/assistant/domain';

/** Mounts the companion once the viewer is known so it never remounts guest-to-user. */
export function AssistantMount({ locale, copy }: { locale: AssistantLocale; copy: SandakCopy }) {
  const viewer = useViewerState();
  if (!viewer) return null;
  const { access, key, aiEnabled } = viewer.assistant;
  return (
    <SandakCompanion key={key} locale={locale} access={access} aiEnabled={aiEnabled} copy={copy} />
  );
}
