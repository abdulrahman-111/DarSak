import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import tailwindPostcss from '@tailwindcss/postcss';
import postcss from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';

async function compileStylesheet(file: string) {
  const stylesheet = await readFile(join(process.cwd(), file), 'utf8');
  const result = await postcss([tailwindPostcss()]).process(stylesheet, {
    from: join(process.cwd(), file),
    map: false,
  });
  return postcss.parse(result.css);
}

function hasClass(root: postcss.Root, className: string) {
  let found = false;
  root.walkRules(rule => {
    if (rule.selector.includes(className)) found = true;
  });
  return found;
}

function hasSelector(root: postcss.Root, fragment: string) {
  let found = false;
  root.walkRules(rule => {
    if (rule.selector.includes(fragment)) found = true;
  });
  return found;
}

function hasDeclaration(root: postcss.Root, property: string, value: string) {
  let found = false;
  root.walkDecls(property, declaration => {
    if (declaration.value.includes(value)) found = true;
  });
  return found;
}

function classRuleHasDeclaration(
  root: postcss.Root,
  className: string,
  property: string,
  value: string,
) {
  let found = false;
  root.walkRules(rule => {
    if (!rule.selector.includes(className)) return;
    rule.walkDecls(property, declaration => {
      if (declaration.value.includes(value)) found = true;
    });
  });
  return found;
}

function classRuleHasMedia(root: postcss.Root, className: string, media: string) {
  let found = false;
  root.walkRules(rule => {
    if (!rule.selector.includes(className)) return;
    rule.walkAtRules('media', atRule => {
      if (atRule.params === media) found = true;
    });
  });
  return found;
}

describe('compiled Tailwind CSS for both applications', () => {
  let publicCss: postcss.Root;
  let adminCss: postcss.Root;

  beforeAll(async () => {
    [publicCss, adminCss] = await Promise.all([
      compileStylesheet('src/app/globals.css'),
      compileStylesheet('apps/admin/src/app/globals.css'),
    ]);
  }, 30_000);

  it('loads each app theme and scans each app plus the admin shared components', () => {
    expect(hasClass(publicCss, 'bg-cream')).toBe(true);
    expect(hasClass(publicCss, 'bg-mint')).toBe(true);
    expect(classRuleHasDeclaration(publicCss, '.bg-cream', 'background-color', '#f6f0e4')).toBe(
      true,
    );

    expect(hasClass(adminCss, 'bg-teal')).toBe(true);
    expect(hasClass(adminCss, 'line-clamp-2')).toBe(true);
    expect(classRuleHasDeclaration(adminCss, '.bg-teal', 'background-color', '#0e4a4b')).toBe(true);
    expect(classRuleHasDeclaration(adminCss, '.border-line', 'border-color', '#e3d9c8')).toBe(true);
  });

  it('emits renamed utilities and keeps global focus styling outside the base layer', () => {
    for (const root of [publicCss, adminCss]) {
      expect(hasClass(root, 'shadow-xs')).toBe(true);
      expect(hasClass(root, 'outline-hidden')).toBe(true);
      expect(hasClass(root, 'wrap-break-word')).toBe(true);
      expect(classRuleHasMedia(root, 'outline-hidden', '(forced-colors: active)')).toBe(true);
    }
    expect(hasClass(publicCss, 'rounded-xs')).toBe(true);
    expect(hasClass(publicCss, 'rounded-sm')).toBe(true);

    const focusRule = publicCss.nodes.find(
      node => node.type === 'rule' && node.selector === ':focus-visible',
    );
    expect(focusRule?.parent?.type).toBe('root');
    expect(hasDeclaration(publicCss, 'outline', '3px solid var(--orange)')).toBe(true);
    const adminFocusRule = adminCss.nodes.find(
      node => node.type === 'rule' && node.selector === ':focus-visible',
    );
    expect(adminFocusRule?.parent?.type).toBe('root');
  });

  it('preserves v3 placeholder color and uses an explicit color for unstyled default borders', () => {
    expect(hasDeclaration(publicCss, 'color', '#9ca3af')).toBe(true);
    expect(hasDeclaration(publicCss, 'border-color', '#e5e7eb')).toBe(true);
    expect(hasSelector(publicCss, '.space-y-4 > :not(:last-child)')).toBe(true);
  });
});
