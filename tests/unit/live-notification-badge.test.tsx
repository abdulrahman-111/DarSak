import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('@/lib/supabase/browser', () => ({ createClient: () => ({}) }));

import {
  getLiveUnread,
  setLiveUnread,
  subscribeToUnreadInserts,
  type RealtimeClientLike,
} from '@/features/notifications/live-unread';
import { NotificationBell } from '@/features/notifications/notification-bell';

function fakeClient(count = 7) {
  let onInsert: (payload: { new: Record<string, unknown> }) => void = () => undefined;
  let onStatus: (status: string) => void = () => undefined;
  const filters: Record<string, unknown>[] = [];
  const channel = {
    on: vi.fn((_type: string, filter: Record<string, unknown>, cb: typeof onInsert) => {
      filters.push(filter);
      onInsert = cb;
      return channel;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      if (cb) onStatus = cb;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    rpc: vi.fn(async () => ({ data: count, error: null })),
  };
  return {
    client: client as unknown as RealtimeClientLike,
    raw: client,
    filters,
    insert: (row: Record<string, unknown>) => onInsert({ new: row }),
    status: (value: string) => onStatus(value),
  };
}

beforeEach(() => setLiveUnread(null));

describe('live unread subscription', () => {
  it('listens to the current user inserts only and bumps the count once per notification', () => {
    setLiveUnread(2);
    const fake = fakeClient();
    subscribeToUnreadInserts(fake.client, 'user-1');
    expect(fake.filters[0]).toEqual({
      event: 'INSERT',
      schema: 'public',
      table: 'user_notifications',
      filter: 'recipient_id=eq.user-1',
    });
    fake.insert({ id: 'n1', read_at: null });
    fake.insert({ id: 'n1', read_at: null });
    fake.insert({ id: 'n2', read_at: null });
    expect(getLiveUnread()).toBe(4);
  });
  it('ignores malformed or already-read rows', () => {
    setLiveUnread(0);
    const fake = fakeClient();
    subscribeToUnreadInserts(fake.client, 'user-1');
    fake.insert({ read_at: null });
    fake.insert({ id: 'n3', read_at: '2026-10-28T00:00:00Z' });
    expect(getLiveUnread()).toBe(0);
  });
  it('resyncs the exact count after a reconnect and unsubscribes on cleanup', async () => {
    setLiveUnread(1);
    const fake = fakeClient(9);
    const stop = subscribeToUnreadInserts(fake.client, 'user-1');
    fake.status('SUBSCRIBED');
    expect(fake.raw.rpc).not.toHaveBeenCalled();
    fake.status('CHANNEL_ERROR');
    fake.status('SUBSCRIBED');
    await vi.waitFor(() => expect(getLiveUnread()).toBe(9));
    expect(fake.raw.rpc).toHaveBeenCalledWith('notifications_unread_count');
    stop();
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationBell', () => {
  const props = {
    userId: 'user-1',
    href: '/en/notifications',
    label: 'Notifications',
    unreadLabel: 'unread',
  };
  it('shows the unread count and caps it at 99+', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationBell, { ...props, initialCount: 3 }),
    );
    expect(html).toContain('href="/en/notifications"');
    expect(html).toContain('aria-label="Notifications, 3 unread"');
    expect(html).toContain('>3<');
    expect(
      renderToStaticMarkup(createElement(NotificationBell, { ...props, initialCount: 150 })),
    ).toContain('>99+<');
  });
  it('shows no badge with zero or unknown unread notifications', () => {
    for (const initialCount of [0, null]) {
      const html = renderToStaticMarkup(
        createElement(NotificationBell, { ...props, initialCount }),
      );
      expect(html).not.toContain('bell-badge');
      expect(html).toContain('aria-label="Notifications"');
    }
  });
  it('is hidden below the desktop breakpoint', () => {
    expect(
      renderToStaticMarkup(createElement(NotificationBell, { ...props, initialCount: 1 })),
    ).toMatch(/class="[^"]*\bhidden\b[^"]*\blg:grid\b/);
  });
});
