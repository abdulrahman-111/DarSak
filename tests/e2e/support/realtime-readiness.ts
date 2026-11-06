export function isPostgresChangesReadyFrame(frameText: string, userId: string) {
  let frame: unknown;
  try {
    frame = JSON.parse(frameText);
  } catch {
    return false;
  }

  let topic: unknown;
  let event: unknown;
  let payload: unknown;
  if (Array.isArray(frame)) {
    [, , topic, event, payload] = frame;
  } else if (frame && typeof frame === 'object') {
    ({ topic, event, payload } = frame as Record<string, unknown>);
  }

  const data = payload as Record<string, unknown> | null;
  const response = data?.response as Record<string, unknown> | undefined;
  const bindings = response?.postgres_changes;

  return (
    topic === `realtime:user-notifications:${userId}` &&
    event === 'phx_reply' &&
    data?.status === 'ok' &&
    Array.isArray(bindings) &&
    bindings.some(binding => {
      if (!binding || typeof binding !== 'object') return false;
      const filter = binding as Record<string, unknown>;
      return (
        filter.id !== undefined &&
        filter.event === 'INSERT' &&
        filter.schema === 'public' &&
        filter.table === 'user_notifications' &&
        filter.filter === `recipient_id=eq.${userId}`
      );
    })
  );
}
