import 'server-only';

export async function unreadNotificationCount(db: { rpc: (name: string, args?: Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}> }): Promise<number|null> {
  const result=await db.rpc('notifications_unread_count');
  return !result.error && Number.isSafeInteger(result.data) && (result.data as number)>=0 ? result.data as number : null;
}
