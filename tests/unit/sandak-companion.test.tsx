import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { deriveMood } from '@/components/sandak/mood';
import { SandakCompanion } from '@/components/sandak/companion';
import en from '../../messages/en.json';

vi.mock('next/navigation', () => ({ usePathname: () => '/en' }));

describe('SanDak mood mapping', () => {
  const idle = { status: 'idle', doneFlash: false, sleeping: false } as const;
  it('maps the real request lifecycle to moods', () => {
    expect(deriveMood(idle)).toBe('idle');
    expect(deriveMood({ ...idle, status: 'pending' })).toBe('thinking');
    expect(deriveMood({ ...idle, status: 'needs_input' })).toBe('needs');
    expect(deriveMood({ ...idle, status: 'error' })).toBe('oops');
    expect(deriveMood({ ...idle, doneFlash: true })).toBe('done');
  });

  it('sleeps only when otherwise idle, so work in progress is never hidden', () => {
    expect(deriveMood({ ...idle, sleeping: true })).toBe('sleep');
    expect(deriveMood({ ...idle, sleeping: true, status: 'pending' })).toBe('thinking');
    expect(deriveMood({ ...idle, sleeping: true, status: 'error' })).toBe('oops');
    expect(deriveMood({ ...idle, sleeping: true, doneFlash: true })).toBe('done');
  });
});

describe('SanDak companion shell', () => {
  it('renders nothing on the server so the remembered hide preference never flashes', () => {
    const html = renderToStaticMarkup(
      createElement(SandakCompanion, {
        locale: 'en',
        access: null,
        aiEnabled: false,
        copy: en.sandak,
      }),
    );
    expect(html).toBe('');
  });
});

/** Static (non-type, non-dynamic) import graph of the always-loaded companion module. */
function staticImports(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+'([^']+)'/gm)) {
    const spec = match[1];
    let target: string | null = null;
    if (spec.startsWith('@/')) target = resolve('src', spec.slice(2));
    else if (spec.startsWith('.')) target = resolve(dirname(file), spec);
    else {
      seen.add(`pkg:${spec}`);
      continue;
    }
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      try {
        readFileSync(target + ext);
        staticImports(target + ext, seen);
        break;
      } catch {
        /* try next extension */
      }
    }
  }
  return seen;
}

describe('SanDak global bundle budget', () => {
  it('keeps zod, chat, guidance and panels out of the always-loaded companion', () => {
    const graph = [...staticImports(resolve('src/components/sandak/companion.tsx'))];
    expect(graph.some(entry => entry.includes('zod'))).toBe(false);
    for (const heavy of [
      'chat-panel',
      'guided-help',
      'guidance',
      'group-draft-panel',
      'assistant/domain',
      'sandak/panel',
    ])
      expect(graph.some(entry => entry.includes(heavy))).toBe(false);
    // Only the lazy dynamic import may reference the panel.
    expect(readFileSync('src/components/sandak/companion.tsx', 'utf8')).toContain(
      "dynamic(() => import('./panel')",
    );
  });
});
