import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SandakPet } from '@/components/sandak/pet';
import { PALETTE, SANDAK_MOODS, spriteRects } from '@/components/sandak/sprite';
import { pageTypeFor } from '@/components/sandak/page-type';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

describe('SanDak pet sprite', () => {
  it.each(SANDAK_MOODS)('renders the %s mood as one decorative inline SVG of rects', mood => {
    const html = renderToStaticMarkup(<SandakPet mood={mood} />);
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain(`data-mood="${mood}"`);
    expect(html).toContain(`sandak-pet--${mood}`);
    expect(html).toContain('aria-hidden="true"');
    const rects = html.match(/<rect /g) ?? [];
    expect(rects.length).toBeGreaterThan(10);
    // Runs of pixels are merged, so the sprite stays far below 256 elements.
    expect(rects.length).toBeLessThan(120);
    expect(html).not.toContain('<div');
  });

  it('scales the canvas and uses only the documented palette', () => {
    const small = renderToStaticMarkup(<SandakPet mood="idle" scale={2} />);
    const large = renderToStaticMarkup(<SandakPet mood="idle" scale={6} />);
    expect(small).toContain('width="32"');
    expect(large).toContain('width="96"');
    const allowed = new Set(Object.values(PALETTE));
    for (const mood of SANDAK_MOODS)
      for (const rect of spriteRects(mood)) expect(allowed.has(rect.fill)).toBe(true);
  });

  it('draws mood-specific faces and extras', () => {
    const signature = (mood: (typeof SANDAK_MOODS)[number]) => JSON.stringify(spriteRects(mood));
    expect(new Set(SANDAK_MOODS.map(signature)).size).toBe(SANDAK_MOODS.length);
    const fills = (mood: (typeof SANDAK_MOODS)[number]) => spriteRects(mood).map(rect => rect.fill);
    expect(fills('needs')).toContain(PALETTE.R);
    expect(fills('done')).toContain(PALETTE.G);
    expect(fills('oops')).toContain(PALETTE.D);
  });

  it('keeps every sprite pixel on the 16 by 16 grid plus headroom', () => {
    for (const mood of SANDAK_MOODS)
      for (const rect of spriteRects(mood)) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(16);
        expect(rect.y).toBeGreaterThanOrEqual(-5);
        expect(rect.y).toBeLessThan(16);
      }
  });
});

describe('SanDak styles and copy', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');

  it('animates each mood and disables all SanDak animation under reduced motion', () => {
    for (const mood of SANDAK_MOODS) expect(css).toContain(`.sandak-pet--${mood} .sandak-sprite`);
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.sandak-sprite');
    expect(reduced).toContain('.sandak-bubble');
    expect(reduced).toContain('.sandak-panel');
    expect(reduced).toContain('animation: none');
  });

  it('docks at the inline end above the mobile navigation', () => {
    expect(css).toMatch(/\.sandak-dock\s*{[^}]*inset-inline-end/);
    expect(css).toContain('body:has([data-mobile-workspace-nav]) .sandak-dock');
  });

  it('keeps English and Arabic copy keys aligned and non-empty', () => {
    expect(Object.keys(ar.sandak).sort()).toEqual(Object.keys(en.sandak).sort());
    for (const value of [...Object.values(en.sandak), ...Object.values(ar.sandak)])
      expect(value.trim()).not.toBe('');
  });

  it('reduces pathnames to coarse page categories only', () => {
    expect(pageTypeFor('/en')).toBe('home');
    expect(pageTypeFor('/ar/teacher/groups/123/students')).toBe('teacher_workspace');
    expect(pageTypeFor('/en/student/requests')).toBe('student_workspace');
    expect(pageTypeFor('/en/groups/abc')).toBe('group');
    expect(pageTypeFor('/en/teachers/abc')).toBe('teacher_profile');
    expect(pageTypeFor('/en/something-else')).toBe('other');
    expect(pageTypeFor(null)).toBe('home');
  });
});
