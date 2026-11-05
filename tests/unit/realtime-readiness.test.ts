import { describe, expect, it } from 'vitest';
import { isPostgresChangesReadyFrame } from '../e2e/support/realtime-readiness';

describe('Realtime postgres_changes readiness', () => {
  const topic = 'realtime:user-notifications:fixture-user';
  const binding = {
    id: 12,
    event: 'INSERT',
    schema: 'public',
    table: 'user_notifications',
    filter: 'recipient_id=eq.fixture-user',
  };
  const reply = {
    status: 'ok',
    response: { postgres_changes: [binding] },
  };

  it('accepts a successful join reply that confirms the exact user INSERT binding', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({ topic, event: 'phx_reply', payload: reply }),
        'fixture-user',
      ),
    ).toBe(true);
  });

  it('accepts the array wire format for the same confirmed binding', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify([null, 'ref', topic, 'phx_reply', reply]),
        'fixture-user',
      ),
    ).toBe(true);
  });

  it('rejects a generic successful join without a postgres_changes binding', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({ topic, event: 'phx_reply', payload: { status: 'ok', response: {} } }),
        'fixture-user',
      ),
    ).toBe(false);
  });

  it('rejects system messages, other topics, failed replies, and unrelated bindings', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({
          topic,
          event: 'system',
          payload: { extension: 'postgres_changes', status: 'ok' },
        }),
        'fixture-user',
      ),
    ).toBe(false);
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({ topic: 'realtime:other', event: 'phx_reply', payload: reply }),
        'fixture-user',
      ),
    ).toBe(false);
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({
          topic,
          event: 'phx_reply',
          payload: { status: 'error', response: { postgres_changes: [binding] } },
        }),
        'fixture-user',
      ),
    ).toBe(false);
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({
          topic,
          event: 'phx_reply',
          payload: {
            status: 'ok',
            response: { postgres_changes: [{ ...binding, filter: 'recipient_id=eq.other' }] },
          },
        }),
        'fixture-user',
      ),
    ).toBe(false);
    const unbound: Record<string, unknown> = { ...binding };
    delete unbound.id;
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({
          topic,
          event: 'phx_reply',
          payload: { status: 'ok', response: { postgres_changes: [unbound] } },
        }),
        'fixture-user',
      ),
    ).toBe(false);
  });
});
