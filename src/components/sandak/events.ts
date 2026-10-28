/**
 * Tiny browser event bridge between SanDai panels and the docked companion.
 * It carries only a lifecycle status, never message text or drafts.
 */
export type SandakStatus = 'idle' | 'pending' | 'needs_input' | 'success' | 'error';

export const SANDAK_STATUS_EVENT = 'sandak:status';
export const SANDAK_RETRY_EVENT = 'sandak:retry';
export const SANDAK_CANCEL_EVENT = 'sandak:cancel';

export type SandakSource = 'chat' | 'draft';
export type SandakStatusDetail = { status: SandakStatus; source: SandakSource };

export function emitSandakStatus(status: SandakStatus, source: SandakSource = 'chat'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SandakStatusDetail>(SANDAK_STATUS_EVENT, { detail: { status, source } }),
  );
}

export function emitSandakSignal(name: typeof SANDAK_RETRY_EVENT | typeof SANDAK_CANCEL_EVENT) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}
