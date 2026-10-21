import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { BookingList, SlotList } from '@/features/bookings/views';

const row = {
  id: 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9',
  slot_id: 'b2c4888a-7630-4e7b-aabc-66310e5a5bc9',
  group_id: 'c2c4888a-7630-4e7b-aabc-66310e5a5bc9',
  group_name: 'Algebra',
  teacher_name: 'Teacher',
  student_name: 'Learner',
  starts_at: '2026-10-22T10:00:00Z',
  ends_at: '2026-10-22T11:00:00Z',
  status: 'pending' as const,
};

describe('booking views', () => {
  it('renders booking decisions and links to the group overview', () => {
    const html = renderToStaticMarkup(
      createElement(BookingList, {
        locale: 'en',
        rows: [row],
        teacher: true,
        empty: 'None',
        now: '2026-10-21T00:00:00Z',
      }),
    );
    expect(html).toContain('Accept');
    expect(html).toContain('Decline');
    expect(html).toContain('/en/teacher/groups/c2c4888a-7630-4e7b-aabc-66310e5a5bc9');
    expect(html).toContain('Pending');
  });

  it('labels teacher slots as published rather than available', () => {
    const html = renderToStaticMarkup(
      createElement(SlotList, {
        locale: 'en',
        rows: [{ ...row, status: 'open' }],
        teacher: true,
        empty: 'None',
        now: '2026-10-21T00:00:00Z',
      }),
    );
    expect(html).toContain('Published');
    expect(html).not.toContain('Available');
  });

  it('hides teacher actions for past appointments and slots', () => {
    const now = '2026-10-23T00:00:00Z';
    const requestHtml = renderToStaticMarkup(
      createElement(BookingList, { locale: 'en', rows: [row], teacher: true, empty: 'None', now }),
    );
    const slotHtml = renderToStaticMarkup(
      createElement(SlotList, {
        locale: 'en',
        rows: [{ ...row, status: 'open' }],
        teacher: true,
        empty: 'None',
        now,
      }),
    );
    expect(requestHtml).not.toContain('Accept');
    expect(requestHtml).not.toContain('Decline');
    expect(slotHtml).not.toContain('Cancel time');
  });

  it('hides teacher decisions when teaching access is inactive', () => {
    const html = renderToStaticMarkup(
      createElement(BookingList, {
        locale: 'en',
        rows: [row],
        teacher: true,
        allowDecision: false,
        empty: 'None',
        now: '2026-10-21T00:00:00Z',
      }),
    );
    expect(html).not.toContain('Accept');
    expect(html).not.toContain('Decline');
  });
});
