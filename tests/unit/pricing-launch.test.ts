import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('server-only', () => ({}));

import PricingPage from '@/app/[locale]/pricing/page';

describe('pricing during the free launch', () => {
  beforeEach(() => redirect.mockReset());

  it.each(['en', 'ar'])(
    'redirects the localized %s pricing route to its home page',
    async locale => {
      await PricingPage({ params: Promise.resolve({ locale }) });
      expect(redirect).toHaveBeenCalledWith(`/${locale}`);
    },
  );
});
