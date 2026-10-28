import { loadViewerState } from '@/features/platform/viewer-state';
import { ANONYMOUS_VIEWER } from '@/features/platform/viewer-state-types';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'Content-Type': 'application/json; charset=utf-8',
};

/** Display-only viewer snapshot for the global header; always private and per user. */
export async function GET() {
  try {
    return new Response(JSON.stringify(await loadViewerState()), { headers: privateHeaders });
  } catch {
    // Same fail-closed behaviour the server-rendered header had: show the guest header.
    return new Response(JSON.stringify(ANONYMOUS_VIEWER), { headers: privateHeaders });
  }
}
