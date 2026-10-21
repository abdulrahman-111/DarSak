import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ viewer: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/student/data', () => ({ viewer: mocks.viewer }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { MatchingPreferencesForm } from '@/features/student-matching/preferences-form';

describe('matching preferences form', () => {
  it('keeps optional days separate and localizes the choices', () => {
    const html = renderToStaticMarkup(
      createElement(MatchingPreferencesForm, {
        locale: 'ar',
        preferredWeekdays: [1, 5],
        updatedAt: '2026-10-20T10:00:00Z',
      }),
    );
    expect(html).toContain('الأيام المفضلة');
    expect(html).toContain('الاثنين');
    expect(html).toContain('الجمعة');
    expect(html.match(/type="checkbox"/g)).toHaveLength(7);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).not.toContain('required');
  });
});
