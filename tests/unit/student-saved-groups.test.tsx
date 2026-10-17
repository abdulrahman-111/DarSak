import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('next/navigation', () => ({ usePathname: () => '/en/student/saved' }));
vi.mock('@/components/active-link', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/active-link')>();
  return {
    ...actual,
    ActiveLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
      createElement('a', { href, className }, children),
  };
});
import { SAVED_GROUP_PAGE_SIZE, savedGroupOffset } from '@/features/student/saved-domain';
import { PlatformShell } from '@/components/platform/shell';

describe('student saved groups', () => {
  it('keeps pages bounded and clamps invalid or stale page requests', () => {
    expect(savedGroupOffset('2', 43)).toBe(20);
    expect(savedGroupOffset('99', 43)).toBe(40);
    expect(savedGroupOffset('-1', 43)).toBe(0);
    expect(savedGroupOffset('2.5', 43)).toBe(0);
    expect(SAVED_GROUP_PAGE_SIZE).toBe(20);
  });

  it('adds saved groups to student navigation in English and Arabic', () => {
    const english = renderToStaticMarkup(<PlatformShell locale="en" role="student" name="Learner">{null}</PlatformShell>);
    const arabic = renderToStaticMarkup(<PlatformShell locale="ar" role="student" name="طالب">{null}</PlatformShell>);
    expect(english).toContain('Saved groups');
    expect(arabic).toContain('المجموعات المحفوظة');
  });
});
