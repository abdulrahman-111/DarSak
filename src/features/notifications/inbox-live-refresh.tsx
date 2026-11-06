'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToLiveNotificationInserts } from './live-unread';

export function InboxLiveRefresh() {
  const router = useRouter();
  useEffect(() => subscribeToLiveNotificationInserts(() => router.refresh()), [router]);
  return null;
}
