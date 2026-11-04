import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ locale: 'en' as string }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: mocks.locale }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));

import NotFound from '@/app/[locale]/not-found';

describe('localized not found page', () => {
  beforeEach(() => {
    mocks.locale = 'en';
  });

  it.each([
    [
      'en',
      'Page not found',
      'The page you are looking for may have moved or is unavailable.',
      'Home',
      '/en',
      'ltr',
    ],
    [
      'ar',
      'الصفحة غير موجودة',
      'قد تكون الصفحة التي تبحث عنها قد انتقلت أو لم تعد متاحة.',
      'الرئيسية',
      '/ar',
      'rtl',
    ],
  ])(
    'renders localized recovery and home link for %s',
    (locale, heading, explanation, home, href, dir) => {
      mocks.locale = locale;
      const html = renderToStaticMarkup(createElement(NotFound));
      expect(html).toContain(heading);
      expect(html).toContain(explanation);
      expect(html).toContain(home);
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`dir="${dir}"`);
      expect(html).toContain('<section');
      expect(html).toContain('aria-labelledby="not-found-heading"');
      expect(html).not.toContain('<main');
      expect(html).toContain('focus-visible:ring-orange');
      expect((html.match(/<a\b/g) || []).length).toBe(1);
    },
  );

  it('falls back to the configured default locale for an invalid route locale', () => {
    mocks.locale = 'invalid';
    const html = renderToStaticMarkup(createElement(NotFound));
    expect(html).toContain('الصفحة غير موجودة');
    expect(html).toContain('href="/ar"');
    expect(html).toContain('dir="rtl"');
  });
});
