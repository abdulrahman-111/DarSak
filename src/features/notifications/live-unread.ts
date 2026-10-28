import { useSyncExternalStore } from 'react';

/**
 * Tiny client-side store for the unread notification count. The header bell owns the
 * Realtime subscription and writes here; the sidebar and mobile "More" badges read from
 * it, falling back to the server-rendered count until the first live update.
 */
let live: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export function setLiveUnread(value: number | null) {
  if (live === value) return;
  live = value;
  emit();
}
export function bumpLiveUnread() {
  live = (live ?? 0) + 1;
  emit();
}
export function getLiveUnread() {
  return live;
}
export function useLiveUnreadCount(serverCount: number | null): number | null {
  const value = useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => live,
    () => null,
  );
  return value ?? serverCount;
}

export type RealtimeChannelLike = {
  on: (
    type: 'postgres_changes',
    filter: Record<string, unknown>,
    callback: (payload: { new: Record<string, unknown> }) => void,
  ) => RealtimeChannelLike;
  subscribe: (callback?: (status: string) => void) => RealtimeChannelLike;
};
export type RealtimeClientLike = {
  channel: (name: string) => RealtimeChannelLike;
  removeChannel: (channel: RealtimeChannelLike) => unknown;
  rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Subscribes to INSERTs on the user's own notifications (RLS protects the stream) and bumps
 * the live count. After a reconnect the exact count is re-read from the database so missed
 * events cannot leave the badge wrong. Returns an unsubscribe function.
 */
export function subscribeToUnreadInserts(client: RealtimeClientLike, userId: string) {
  const seen = new Set<string>();
  let connectedBefore = false;
  const channel = client
    .channel(`user-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_notifications',
        filter: `recipient_id=eq.${userId}`,
      },
      payload => {
        const row = payload.new;
        const id = typeof row.id === 'string' ? row.id : null;
        if (!id || seen.has(id) || row.read_at) return;
        seen.add(id);
        bumpLiveUnread();
      },
    )
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      if (connectedBefore) {
        void Promise.resolve(client.rpc('notifications_unread_count')).then(
          ({ data, error }) => {
            if (!error && Number.isSafeInteger(data) && (data as number) >= 0)
              setLiveUnread(data as number);
          },
          () => undefined,
        );
      }
      connectedBefore = true;
    });
  return () => void client.removeChannel(channel);
}
