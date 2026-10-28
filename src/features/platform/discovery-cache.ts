import { updateTag } from 'next/cache';

/** Tag shared by every cached public discovery read (catalogue, teachers, default group listings). */
export const PUBLIC_DISCOVERY_TAG = 'public-discovery';
/** Short TTL: bounds staleness for changes made outside the app (admin approvals, SQL). */
export const PUBLIC_DISCOVERY_REVALIDATE_SECONDS = 60;

/**
 * Expires the cached public discovery reads after a teacher publishes or edits
 * something public. Call it from Server Actions only (updateTag throws elsewhere);
 * the short TTL still bounds staleness if it is ever skipped.
 */
export function invalidatePublicDiscovery() {
  try {
    updateTag(PUBLIC_DISCOVERY_TAG);
  } catch {
    // Not in a Server Action context: the revalidate window expires the entry instead.
  }
}
