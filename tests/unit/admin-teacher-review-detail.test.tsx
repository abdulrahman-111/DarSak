import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { requireViewerMock, notFoundMock } = vi.hoisted(() => ({ requireViewerMock: vi.fn(), notFoundMock: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));
vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@/components/platform/access', () => ({ requireViewer: requireViewerMock }));
vi.mock('@/components/platform/ui', () => ({
  Panel: ({ children, ...props }: any) => <section {...props}>{children}</section>,
  ScreenTitle: ({ title, action }: any) => <header><h1>{title}</h1>{action}</header>,
  Status: ({ value }: any) => <span>{value}</span>, cairoDate: () => 'date',
}));
vi.mock('@/features/admin/review-form', () => ({ ReviewDecisionForm: () => <button>Decision controls</button> }));

import AdminTeacherReviewDetail from '@/app/[locale]/admin/teachers/[id]/page';

const id = '11111111-1111-4111-8111-111111111111';
function setup({ profileError = null, teacherError = null, missing = false }: { profileError?: unknown; teacherError?: unknown; missing?: boolean } = {}) {
  const from = vi.fn((table: string) => ({
    select: () => {
      const result = table === 'profiles'
        ? { data: missing || profileError ? null : { id, full_name: 'Teacher', status: 'active' }, error: profileError }
        : table === 'teacher_profiles'
          ? { data: missing || teacherError ? null : { headline: 'Tutor', bio: null, approved: false }, error: teacherError }
          : { data: [], error: null };
      const chain: any = { eq: () => chain, maybeSingle: async () => result, in: async () => result };
      return chain;
    },
  }));
  const db = { from, rpc: async () => ({ data: { teacher_id: id, status: 'pending', request_id: '22222222-2222-4222-8222-222222222222', requested_at: '2026-10-01', reviewed_at: null, decline_reason: null, events: [] }, error: null }) };
  requireViewerMock.mockResolvedValue({ db });
  return { from };
}
async function page(locale = 'en') {
  return AdminTeacherReviewDetail({ params: Promise.resolve({ locale, id }), searchParams: Promise.resolve({ q: 'Ada', status: 'pending', page: '2' }) });
}

beforeEach(() => { requireViewerMock.mockReset(); notFoundMock.mockReset().mockImplementation(() => { throw new Error('not found'); }); });

describe('admin teacher review detail loading', () => {
  it.each([
    ['profiles', { profileError: { code: '57014' } }],
    ['teacher_profiles', { teacherError: { code: '57014' } }],
  ])('renders a retryable error for a failed %s read', async (_table, options) => {
    setup(options as { profileError?: unknown; teacherError?: unknown });
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain('could not be loaded');
    expect(markup).toContain('Refresh and try again');
    expect(markup).toContain('method="get"');
    expect(markup).not.toContain('Decision controls');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('keeps a successful missing profile as a 404', async () => {
    setup({ missing: true });
    await expect(page()).rejects.toThrow('not found');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('renders the normal review controls for complete successful reads', async () => {
    setup();
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain('Teacher');
    expect(markup).toContain('Decision controls');
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
