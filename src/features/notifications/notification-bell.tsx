'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import {
  setLiveUnread,
  subscribeToUnreadInserts,
  useLiveUnreadCount,
  type RealtimeClientLike,
} from './live-unread';

/**
 * Desktop header bell with a live unread badge. It is mounted for every signed-in
 * workspace user (hidden below `lg`) because it also owns the Realtime subscription that
 * keeps the mobile and sidebar badges current.
 */
export function NotificationBell({
  userId,
  initialCount,
  href,
  label,
  unreadLabel,
}: {
  userId: string;
  initialCount: number | null;
  href: string;
  label: string;
  unreadLabel: string;
}) {
  useEffect(() => {
    setLiveUnread(initialCount);
  }, [initialCount]);
  useEffect(() => {
    let stop: (() => void) | undefined;
    try {
      stop = subscribeToUnreadInserts(createClient() as unknown as RealtimeClientLike, userId);
    } catch {
      // Realtime is an enhancement: without it the badge still updates on navigation.
    }
    return () => {
      stop?.();
      setLiveUnread(null);
    };
  }, [userId]);
  const count = useLiveUnreadCount(initialCount);
  const shown = count !== null && count > 0;
  return (
    <Link
      href={href}
      aria-label={shown ? `${label}, ${count} ${unreadLabel}` : label}
      title={label}
      className="relative hidden size-11 place-items-center rounded-xl border border-line-strong text-teal transition-colors hover:bg-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange lg:grid"
    >
      <Bell size={17} aria-hidden="true" />
      {shown && (
        <span
          aria-hidden="true"
          data-testid="bell-badge"
          className="absolute -end-1 -top-1 min-w-5 rounded-full bg-orange px-1 text-center text-xs font-black leading-5 text-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
