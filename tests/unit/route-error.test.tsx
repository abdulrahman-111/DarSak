import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ locale: 'en' as string, refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: mocks.locale }), useRouter: () => ({ refresh: mocks.refresh }) }));

import PageError from '@/app/[locale]/error';
import { RouteError } from '@/components/route-feedback';

describe('page route error boundary', () => {
  beforeEach(() => { mocks.locale = 'en'; mocks.refresh.mockReset(); });

  it.each([
    ['en', 'We could not load this page right now.', 'Please try again in a moment.', 'Try again'],
    ['ar', 'تعذر تحميل هذه الصفحة الآن.', 'يرجى المحاولة مرة أخرى بعد قليل.', 'حاول مرة أخرى'],
  ])('shows localized recovery guidance without exposing error details (%s)', (locale, title, hint, retryText) => {
    mocks.locale = locale;
    const error = new Error('private database failure');
    error.stack = 'private stack trace';
    const reset = vi.fn();
    const boundary = PageError({ error, reset });
    const html = renderToStaticMarkup(boundary);

    expect(html).toContain(`<h1`);
    expect(html).toContain(title);
    expect(html).toContain(hint);
    expect(html).toContain(retryText);
    expect(html).not.toContain(error.message);
    expect(html).not.toContain(error.stack);
  });

  it('refreshes server data and then resets the root boundary on retry', () => {
    const reset = vi.fn();
    const boundary = PageError({ error: new Error('private failure'), reset });
    const rendered = RouteError(boundary.props);
    const retryButton = rendered.props.children.props.children[1];

    retryButton.props.onClick();

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('preserves the existing group and discovery error messages', () => {
    mocks.locale = 'en';
    const retry = vi.fn();
    expect(renderToStaticMarkup(createElement(RouteError, { area: 'group', retry }))).toContain('We could not load this group right now.');
    expect(renderToStaticMarkup(createElement(RouteError, { area: 'discovery', retry }))).toContain('We could not load discovery right now.');
  });
});
