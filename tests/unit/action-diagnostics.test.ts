import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { logActionFailure } from '@/lib/action-diagnostics';

describe('logActionFailure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs only the safe code and diagnostic fields, using fallback for unsafe codes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sensitive = {
      code: '23505',
      message: 'database message with token secret-token and /private/material.pdf',
      email: 'teacher@example.com',
      contact: '+15551234567',
    };

    logActionFailure('materials.metadata.save', Date.now(), sensitive, 'DB_ERROR');
    logActionFailure(
      'materials.storage.upload',
      Date.now(),
      { ...sensitive, code: 'token-secret' },
      'STORAGE_ERROR',
    );

    const entries = warn.mock.calls.map(([entry]) => JSON.parse(String(entry)));
    expect(entries).toEqual([
      expect.objectContaining({
        event: 'server_action_failure',
        operation: 'materials.metadata.save',
        code: '23505',
      }),
      expect.objectContaining({
        event: 'server_action_failure',
        operation: 'materials.storage.upload',
        code: 'STORAGE_ERROR',
      }),
    ]);
    for (const [index, entry] of entries.entries()) {
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(entry.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(Object.keys(entry).sort()).toEqual([
        'code',
        'correlationId',
        'durationMs',
        'event',
        'operation',
      ]);
      expect(String(warn.mock.calls[index][0])).not.toMatch(
        /secret-token|private\/material|teacher@example\.com|\+15551234567|database message/i,
      );
    }
  });
});
