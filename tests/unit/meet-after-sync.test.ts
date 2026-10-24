import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  config: vi.fn(),
  kick: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/features/meet/config', () => ({ getGoogleMeetConfig: mocks.config }));
vi.mock('@/features/meet/worker', () => ({ kickGoogleMeetSync: mocks.kick }));

import { scheduleGoogleMeetSync } from '@/features/meet/after-sync';

afterEach(() => vi.clearAllMocks());

describe('best-effort Meet sync scheduling', () => {
  it('does not register after work when Google Meet is not configured', () => {
    mocks.config.mockReturnValue(null);
    expect(() => scheduleGoogleMeetSync({} as never)).not.toThrow();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('does not let after registration errors escape a successful lesson action', () => {
    mocks.config.mockReturnValue({ enabled: true });
    mocks.after.mockImplementation(() => {
      throw new Error('outside request context');
    });
    expect(() => scheduleGoogleMeetSync({} as never)).not.toThrow();
  });
});
