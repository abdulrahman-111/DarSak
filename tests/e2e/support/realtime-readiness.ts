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

  return (
    topic === `realtime:user-notifications:${userId}` &&
    event === 'system' &&
    !!payload &&
    typeof payload === 'object' &&
    (payload as Record<string, unknown>).extension === 'postgres_changes' &&
    (payload as Record<string, unknown>).status === 'ok'
  );
}
