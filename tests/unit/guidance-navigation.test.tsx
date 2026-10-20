import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));

import { GuidancePageView } from '@/features/help/page';

describe('guidance page navigation', () => {
  it.each(['en', 'ar'])(
    'keeps recovery and reporting links on help, not policy pages (%s)',
    locale => {
      const help = renderToStaticMarkup(createElement(GuidancePageView, { kind: 'help', locale }));
      const terms = renderToStaticMarkup(
        createElement(GuidancePageView, { kind: 'terms', locale }),
      );
      const privacy = renderToStaticMarkup(
        createElement(GuidancePageView, { kind: 'privacy', locale }),
      );

      expect(help).toContain(`href="/${locale}/forgot-password"`);
      expect(help).toContain(`href="/${locale}/reports"`);
      for (const page of [terms, privacy]) {
        expect(page).not.toContain(`href="/${locale}/forgot-password"`);
        expect(page).not.toContain(`href="/${locale}/reports"`);
        expect(page).toContain(`href="/${locale}/help"`);
      }
    },
  );
});
