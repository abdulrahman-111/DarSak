import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ setup: vi.fn(), access: vi.fn(), review: vi.fn(), learning: vi.fn() }));
vi.mock('@/features/teacher/setup-data', () => ({ teacherGroupSetup: mocks.setup }));
vi.mock('@/components/platform/access', () => ({ requireTeachingAccess: mocks.access }));
vi.mock('@/features/teacher/group-learning-data', () => ({ groupLearningDetails: mocks.learning }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound'); } }));
vi.mock('@/i18n/config', () => ({ ensureLocale: (locale: string) => locale }));
vi.mock('@/features/teacher/unsaved-profile-protection', () => ({ UnsavedProfileProtection: ({ children }: { children: unknown }) => children }));
vi.mock('@/features/teacher/group-learning-view', () => ({ GroupLearningView: () => null }));
vi.mock('@/features/teacher/setup-forms', () => ({ GroupDetailsForm: () => null, GroupSetupSteps: () => null, WeeklyScheduleStepForm: () => null }));
vi.mock('@/features/teacher/publish-form', () => ({ PublishReviewForm: () => null }));
vi.mock('@/components/platform/ui', () => ({ Panel: ({ children }: { children: unknown }) => children, ScreenTitle: () => null, Status: () => null }));

import TeacherGroupSetupPage from '@/app/[locale]/teacher/groups/[id]/setup/page';

const group = { id: '22222222-2222-4222-8222-222222222222', name: 'Algebra', status: 'draft' };
function setupResult(status = 'draft') {
  return { notFound: false, error: null, group: { ...group, status }, values: {}, catalogue: { choices: [] }, slots: [], exclusions: [], scheduleProposal: null, scheduleProposalError: null, me: { id: 'teacher-1', teacher: {}, db: { rpc: mocks.review } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('teacher group setup step reads', () => {
  beforeEach(() => {
    mocks.setup.mockReset().mockResolvedValue(setupResult());
    mocks.access.mockReset().mockResolvedValue(undefined);
    mocks.review.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.learning.mockReset().mockResolvedValue({ data: {}, error: null });
  });

  it.each(['details', 'schedule', 'review'])('loads only the independent reads used by the %s step', async step => {
    const page = await TeacherGroupSetupPage({ params: Promise.resolve({ locale: 'en', id: group.id }), searchParams: Promise.resolve({ step }) });
    expect(page).toBeTruthy();
    expect(mocks.review).toHaveBeenCalledTimes(step === 'review' ? 1 : 0);
    expect(mocks.learning).toHaveBeenCalledTimes(step === 'schedule' ? 0 : 1);
  });

  it('starts review status and learning details together while both are pending', async () => {
    const review = deferred<{ data: null; error: null }>();
    const learning = deferred<{ data: {}; error: null }>();
    const started = new Set<string>();
    mocks.review.mockImplementation(() => { started.add('review'); return review.promise; });
    mocks.learning.mockImplementation(() => { started.add('learning'); return learning.promise; });
    const result = TeacherGroupSetupPage({ params: Promise.resolve({ locale: 'en', id: group.id }), searchParams: Promise.resolve({ step: 'review' }) });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(started).toEqual(new Set(['review', 'learning']));
    review.resolve({ data: null, error: null });
    learning.resolve({ data: {}, error: null });
    await expect(result).resolves.toBeTruthy();
  });

  it.each([
    ['load error', { ...setupResult(), error: 'load failed', group: null, values: null }],
    ['missing group', { ...setupResult(), group: null, values: null }],
    ['non-owned group', { ...setupResult(), notFound: true, error: 'Group not found.', group: null, values: null }],
    ['non draft', setupResult('published')],
  ])('does not start follow-up reads for %s', async (_label, result) => {
    mocks.setup.mockResolvedValue(result);
    const call = TeacherGroupSetupPage({ params: Promise.resolve({ locale: 'en', id: group.id }), searchParams: Promise.resolve({ step: 'review' }) });
    if (result.group?.status === 'published' || result.notFound) await expect(call).rejects.toThrow('notFound');
    else await expect(call).resolves.toBeTruthy();
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.learning).not.toHaveBeenCalled();
  });
});
