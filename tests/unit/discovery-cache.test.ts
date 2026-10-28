import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateTag: vi.fn() }));
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }));

import {
  invalidatePublicDiscovery,
  PUBLIC_DISCOVERY_TAG,
} from '@/features/platform/discovery-cache';

describe('public discovery cache invalidation', () => {
  beforeEach(() => mocks.updateTag.mockReset());

  it('expires the shared discovery tag', () => {
    invalidatePublicDiscovery();
    expect(mocks.updateTag).toHaveBeenCalledWith(PUBLIC_DISCOVERY_TAG);
  });

  it('does not break a caller outside a Server Action', () => {
    mocks.updateTag.mockImplementation(() => {
      throw new Error('updateTag can only be called from within a Server Action');
    });
    expect(() => invalidatePublicDiscovery()).not.toThrow();
  });
});
