import { describe, expect, it } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { normalizeStudentPage, STUDENT_PAGE_SIZE, studentPageCount } from '@/features/student/pagination-domain';
import { StudentPagination } from '@/features/student/pagination';

describe('student history paging', () => {
  it('normalizes invalid page inputs and computes bounded pages from exact totals', () => {
    expect(normalizeStudentPage('3')).toBe(3);
    expect(normalizeStudentPage('0')).toBe(1);
    expect(normalizeStudentPage('1.5')).toBe(1);
    expect(studentPageCount(0)).toBe(1);
    expect(studentPageCount(STUDENT_PAGE_SIZE + 1)).toBe(2);
  });

  it('keeps independent section pages in pagination links', () => {
    const nav = StudentPagination({
      locale: 'en', href: '/en/teacher/groups/example', page: 2, pageCount: 3,
      labels: { previous: 'Previous', next: 'Next', page: 'Page' },
      pageParam: 'roster_page', preserve: { page: 4 },
    }) as ReactElement<{ children: ReactNode[] }>;
    const children = nav.props.children as ReactElement<{ href: string; rel: string }>[];
    expect(children[0].props).toMatchObject({ href: '/en/teacher/groups/example?page=4&roster_page=1', rel: 'prev' });
    expect(children[2].props).toMatchObject({ href: '/en/teacher/groups/example?page=4&roster_page=3', rel: 'next' });
  });
});
