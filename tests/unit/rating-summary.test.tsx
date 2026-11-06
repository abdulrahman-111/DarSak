import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RatingSummary } from '@/features/feedback/rating-summary';

describe('public rating summary', () => {
  it('shows a localized accessible teacher label at the public threshold', () => {
    const en = renderToStaticMarkup(
      createElement(RatingSummary, { average: 4.6, count: 12, locale: 'en' }),
    );
    expect(en).toContain('role="group"');
    expect(en).toContain('aria-label="Teacher rating: 4.6 out of 5, 12 reviews"');
    expect(en).toContain('Teacher rating');
    expect(en).toContain('aria-hidden="true"');
    const ar = renderToStaticMarkup(
      createElement(RatingSummary, { average: 4.6, count: 3, locale: 'ar' }),
    );
    expect(ar).toContain('تقييم المعلم');
    expect(ar).toContain('٤٫٦');
  });

  it('fails closed for below-threshold or malformed summaries', () => {
    for (const props of [
      { average: 4.8, count: 2 },
      { average: Number.NaN, count: 3 },
      { average: 6, count: 3 },
      { average: 4, count: 3.5 },
      { average: null, count: 12 },
    ]) {
      expect(renderToStaticMarkup(createElement(RatingSummary, { ...props, locale: 'en' }))).toBe(
        '',
      );
    }
  });
});
