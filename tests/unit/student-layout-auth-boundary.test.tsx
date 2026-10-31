import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireViewer: vi.fn(), pathname: '/en/student/classes' }));
vi.mock('@/components/platform/access', () => ({ requireViewer: mocks.requireViewer }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  usePathname: () => mocks.pathname,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));
vi.mock('@/components/active-link', () => ({
  ActiveLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));

import StudentLayout from '@/app/[locale]/student/layout';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('student workspace auth boundary', () => {
  beforeEach(() => {
    mocks.requireViewer.mockReset();
    mocks.pathname = '/en/student/classes';
  });

  it('keeps the fallback generic and holds private children until student authorization resolves', async () => {
    const viewer = deferred<{ fullName: string }>();
    mocks.requireViewer.mockReturnValue(viewer.promise);
    const layout = (await StudentLayout({
      params: Promise.resolve({ locale: 'en' }),
      children: createElement('p', null, 'PRIVATE_CLASS_SENTINEL'),
    })) as ReactElement<{ fallback: ReactNode; children: ReactNode }>;
    const fallback = renderToStaticMarkup(layout.props.fallback as ReactElement);
    expect(fallback).toContain('Loading page…');
    expect(fallback).not.toContain('PRIVATE_CLASS_SENTINEL');
    expect(fallback).not.toContain('E2E Student');

    const shell = layout.props.children as ReactElement<{
      locale: string;
      children: ReactNode;
    }>;
    let settled = false;
    const pendingShell = Promise.resolve(
      (shell.type as (props: typeof shell.props) => Promise<ReactNode>)(shell.props),
    ).then(result => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mocks.requireViewer).toHaveBeenCalledExactlyOnceWith('en', 'student');

    viewer.resolve({ fullName: 'E2E Student' });
    const authorizedShell = await pendingShell;
    const authorizedMarkup = renderToStaticMarkup(authorizedShell as ReactElement);
    expect(authorizedMarkup).toContain('E2E Student');
    expect(authorizedMarkup).toContain('PRIVATE_CLASS_SENTINEL');
  });

  it.each(['guest', 'wrong role'])(
    'never creates a private shell for %s authorization',
    async kind => {
      const viewer = deferred<never>();
      mocks.requireViewer.mockReturnValue(viewer.promise);
      const layout = (await StudentLayout({
        params: Promise.resolve({ locale: 'en' }),
        children: createElement('p', null, 'PRIVATE_CLASS_SENTINEL'),
      })) as ReactElement<{ children: ReactNode }>;
      const shell = layout.props.children as ReactElement<{
        locale: string;
        children: ReactNode;
      }>;
      const pendingShell = (shell.type as (props: typeof shell.props) => Promise<ReactNode>)(
        shell.props,
      );
      viewer.reject(new Error(`${kind} redirected`));
      await expect(pendingShell).rejects.toThrow(`${kind} redirected`);
    },
  );
});
