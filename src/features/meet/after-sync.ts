import 'server-only';

import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleMeetConfig } from './config';
import { kickGoogleMeetSync } from './worker';

/** Drains a small batch after the lesson transaction has already committed. */
export function scheduleGoogleMeetSync(db: SupabaseClient): void {
  if (!getGoogleMeetConfig()) return;
  try {
    after(async () => {
      try {
        await kickGoogleMeetSync(db);
      } catch {
        // The durable queue can be drained on a later teacher sync request.
      }
    });
  } catch {
    // Scheduling must never change the outcome of the lesson transaction.
  }
}
