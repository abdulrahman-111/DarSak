import { describe, expect, it } from 'vitest';
import { isPostgresChangesReadyFrame } from '../e2e/support/realtime-readiness';

describe('Realtime postgres_changes readiness', () => {
  const topic = 'realtime:user-notifications:fixture-user';

  it('accepts the postgres_changes system confirmation for the matching user topic', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({
          topic,
          event: 'system',
          payload: { extension: 'postgres_changes', status: 'ok' },
        }),
        'fixture-user',
      ),
    ).toBe(true);
  });

  it('accepts the array wire format for that same system confirmation', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify([
          null,
          'ref',
          topic,
          'system',
          { extension: 'postgres_changes', status: 'ok' },
        ]),
        'fixture-user',
      ),
    ).toBe(true);
  });

  it('does not treat a successful channel join as postgres_changes readiness', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({ topic, event: 'phx_reply', payload: { status: 'ok', response: {} } }),
        'fixture-user',
      ),
    ).toBe(false);
  });

  it('rejects a different topic or failed binding confirmation', () => {
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({
          topic: 'realtime:user-notifications:other-user',
          event: 'system',
          payload: { extension: 'postgres_changes', status: 'ok' },
        }),
        'fixture-user',
      ),
    ).toBe(false);
    expect(
      isPostgresChangesReadyFrame(
        JSON.stringify({
          topic,
          event: 'system',
          payload: { extension: 'postgres_changes', status: 'error' },
        }),
        'fixture-user',
      ),
    ).toBe(false);
  });
});
