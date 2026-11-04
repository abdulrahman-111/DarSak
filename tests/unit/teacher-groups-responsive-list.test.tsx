import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TeacherGroupsResponsiveList } from '@/features/teacher/groups-responsive-list';
import { SlotFields } from '@/features/teacher/setup-forms';

vi.mock('server-only', () => ({}));

describe('teacher responsive workspace layouts', () => {
  it('provides a semantic desktop table and keeps the mobile group actions available', () => {
    const html = renderToStaticMarkup(
      createElement(TeacherGroupsResponsiveList, {
        locale: 'en',
        groups: [
          {
            id: 'group-1',
            name: 'Algebra group',
            description: 'A small group for algebra practice.',
            status: 'draft',
            capacity: 8,
            location: 'Online',
            subject: 'Mathematics',
          },
        ],
      }),
    );

    expect(html).toContain('<table');
    expect(html).toContain('<caption class="sr-only">My groups</caption>');
    expect(html).toContain('<th scope="col"');
    expect(html).toContain('hidden min-w-0 overflow-hidden');
    expect(html).toContain('grid min-w-0 gap-4 lg:hidden');
    expect(html).toContain('Algebra group');
    expect(html).toContain('Resume setup →');
    expect(html).toContain('Cancel / archive group');
    expect(html).toContain('Delete unused group');
    expect(html).toContain('/en/teacher/groups/group-1/setup?step=details');
  });

  it('keeps weekly schedule controls stacked and shrinkable at narrow widths', () => {
    const html = renderToStaticMarkup(
      createElement(SlotFields, {
        locale: 'en',
        idPrefix: 'new',
        weekday: 1,
        start: '18:00',
        end: '19:00',
        onWeekday: () => undefined,
        onStart: () => undefined,
        onEnd: () => undefined,
      }),
    );

    expect(html).toContain('grid min-w-0 gap-3 sm:grid-cols-3');
    expect(html.match(/min-w-0 max-w-full/g)).toHaveLength(3);
    expect(html).toContain('Weekday');
    expect(html).toContain('Start time');
    expect(html).toContain('End time');
    expect(html).toContain('type="time"');
  });
});
