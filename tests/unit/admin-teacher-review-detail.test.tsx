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
vi.mock('@/features/admin/review-form', () => ({ ReviewDecisionForm: ({ submittedReady }: { submittedReady: boolean }) => submittedReady ? <button>Decision controls</button> : null }));

import AdminTeacherReviewDetail from '@/app/[locale]/admin/teachers/[id]/page';

const id = '11111111-1111-4111-8111-111111111111';
function setup({ profileError = null, teacherError = null, applicationError = null, missing = false }: { profileError?: unknown; teacherError?: unknown; applicationError?: unknown; missing?: boolean } = {}) {
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
  const db = { from, rpc: async (name: string) => name === 'read_teacher_application'
    ? { data: { application: { teacher_id: id, status: 'submitted', teaching_years: 3, admin_phone: '+20123456789', cv_path: `${id}/cv.pdf`, supporting_links: [], attested: true, snapshot: { full_name: 'Teacher', headline: 'Tutor', specializations: [{ id: 'subject', label_ar: 'رياضيات · ابتدائي', label_en: 'Math · Primary' }], profile_details: { about: { en: 'About', ar: '' }, approach: { en: 'An approach for learners.', ar: '' }, goals: { en: '', ar: '' }, qualifications: [], experience: [], languages: ['English'], city: { en: '', ar: '' }, teaching_mode: 'online', layout: 'classic', palette: 'teal', section_order: ['about', 'qualifications', 'experience', 'approach', 'goals'], hidden_sections: [] }, teaching_years: 3, admin_phone: '+20123456789', supporting_links: [], cv_path: `${id}/cv.pdf`, attested: true }, feedback: null, submitted_at: '2026-10-01', reviewed_at: null, reviewed_by: null, updated_at: '2026-10-01', legacy_approved: false }, missing: [] }, error: applicationError }
    : { data: { teacher_id: id, status: 'pending', request_id: '22222222-2222-4222-8222-222222222222', requested_at: '2026-10-01', reviewed_at: null, decline_reason: null, events: [] }, error: null } };
  requireViewerMock.mockResolvedValue({ db });
  return { from };
}
async function page(locale = 'en') {
  return AdminTeacherReviewDetail({ params: Promise.resolve({ locale, id }), searchParams: Promise.resolve({ q: 'Ada', status: 'pending', page: '2' }) });
}

beforeEach(() => { requireViewerMock.mockReset(); notFoundMock.mockReset().mockImplementation(() => { throw new Error('not found'); }); });

describe('admin teacher review detail loading', () => {
  it.each([
    ['profiles', { profileError: { code: '57014' } }, 'en', 'The account and profile could not be loaded. Refresh and try again.'],
    ['teacher_profiles', { teacherError: { code: '57014' } }, 'en', 'The account and profile could not be loaded. Refresh and try again.'],
    ['profiles', { profileError: { code: '57014' } }, 'ar', 'تعذر تحميل بيانات الحساب والملف التعريفي. حاول إعادة تحميل الصفحة.'],
    ['teacher_profiles', { teacherError: { code: '57014' } }, 'ar', 'تعذر تحميل بيانات الحساب والملف التعريفي. حاول إعادة تحميل الصفحة.'],
  ])('renders a localized retryable error for a failed %s read in %s', async (_table, options, locale, localizedError) => {
    setup(options as { profileError?: unknown; teacherError?: unknown });
    const markup = renderToStaticMarkup(await page(locale as string));
    expect(markup).toContain(localizedError as string);
    expect(markup).toContain('method="get"');
    expect(markup).toContain('name="q" value="Ada"');
    expect(markup).toContain('name="status" value="pending"');
    expect(markup).toContain('name="page" value="2"');
    expect(markup).toContain('min-h-11');
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

  it('fails closed without decision controls when the private application read is degraded', async () => {
    setup({ applicationError: { code: '57014' } });
    const markup = renderToStaticMarkup(await page());
    expect(markup).toContain('Some review details could not be loaded');
    expect(markup).not.toContain('Decision controls');
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
