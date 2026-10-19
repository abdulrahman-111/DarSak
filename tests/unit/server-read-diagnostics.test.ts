import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { measuredServerRead } from '@/lib/server-read-diagnostics';
import { onRequestError } from '../../src/instrumentation';

describe('server read diagnostics', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('keeps fast reads quiet and returns their result unchanged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = { error: null, payload: 'keep me' };
    await expect(measuredServerRead('student_resources', 'en', async () => result)).resolves.toBe(result);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on slow reads with only bounded categorical metadata', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 10;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const result = await measuredServerRead('public_teacher_detail', 'ar', async () => {
      now += 10_000_000;
      return { error: null, teacherName: 'private result' };
    });
    expect(result.teacherName).toBe('private result');
    expect(warn).toHaveBeenCalledOnce();
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).toContain('public_teacher_detail');
    expect(logged).toContain('ar');
    expect(logged).not.toContain('private result');
    expect(logged).not.toContain('teacherName');
    expect(warn.mock.calls[0][1]).toMatchObject({ outcome: 'success', duration_ms: 120_000 });
    expect(Object.keys(warn.mock.calls[0][1] as object).sort()).toEqual(['duration_ms', 'locale', 'operation', 'outcome']);
  });

  it('records failed reads without the error and rethrows the original error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = new Error('secret name, id, URL and provider detail');
    await expect(measuredServerRead('teacher_overview', 'en', async () => { throw original; })).rejects.toBe(original);
    expect(warn).toHaveBeenCalledOnce();
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).not.toContain(original.message);
    expect(logged).not.toContain('stack');
    expect(warn.mock.calls[0][1]).toMatchObject({ outcome: 'failed' });
  });

  it('marks a returned loader error as failed while preserving the loader result', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = { error: 'localized failure text', records: ['private record'] };
    await expect(measuredServerRead('teacher_overview', 'en', async () => result, value => !!value.error)).resolves.toBe(result);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][1]).toMatchObject({ outcome: 'failed' });
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('localized failure text');
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('private record');
  });

  it('does not let logging failures alter read success or the original thrown error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('logger failed'); });
    await expect(measuredServerRead('student_resources', 'en', async () => 17)).resolves.toBe(17);
    const original = new Error('original failure');
    await expect(measuredServerRead('student_resources', 'en', async () => { throw original; })).rejects.toBe(original);
  });
});

describe('request error instrumentation', () => {
  it('logs only the allowed route type, excluding request and error details', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await onRequestError?.(
      new Error('sensitive stack and profile id'),
      { path: '/secret/path?token=hidden', method: 'POST', headers: { authorization: 'secret-header' } },
      { routerKind: 'App Router', routePath: '/secret/[id]', routeType: 'action', revalidateReason: undefined },
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toBe('server_request_error');
    expect(warn.mock.calls[0][1]).toEqual({ route_type: 'action' });
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).not.toMatch(/secret|profile|path|token|authorization|headers|digest|stack|message/i);
  });

  it('swallows instrumentation logging failures', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('logger failed'); });
    await expect(onRequestError?.(
      new Error('request failure'),
      { path: '/private', method: 'GET', headers: {} },
      { routerKind: 'App Router', routePath: '/private', routeType: 'render', revalidateReason: undefined },
    )).resolves.toBeUndefined();
  });
});
