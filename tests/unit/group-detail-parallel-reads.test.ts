import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  classDetail: vi.fn(),
  enrollment: vi.fn(),
  saved: vi.fn(),
  viewer: vi.fn(),
  announcement: vi.fn(),
  learning: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('next/image', () => ({ default: 'img' }));
vi.mock('@/i18n/config', () => ({
  getDictionary: vi.fn().mockResolvedValue({ groups: 'Groups' }),
}));
vi.mock('@/components/public/copy', () => ({ publicCopy: { en: {}, ar: {} } }));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: () => true }));
vi.mock('@/features/student/data', () => ({
  classDetail: mocks.classDetail,
  enrollmentForGroup: mocks.enrollment,
}));
vi.mock('@/features/student/saved-data', () => ({ savedGroupStatus: mocks.saved }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.viewer }));
vi.mock('@/features/groups/announcement-data', () => ({ groupAnnouncement: mocks.announcement }));
vi.mock('@/features/teacher/group-learning-data', () => ({ groupLearningDetails: mocks.learning }));
vi.mock('@/features/teacher/group-learning-view', () => ({ GroupLearningView: () => null }));
vi.mock('@/features/feedback/group-section', () => ({ GroupFeedbackSection: () => null }));
vi.mock('@/features/student/forms', () => ({ EnrollmentForm: () => null }));
vi.mock('@/features/student/public-group-share', () => ({ PublicGroupShare: () => null }));
vi.mock('@/features/student/saved-form', () => ({ SavedGroupForm: () => null }));
vi.mock('@/features/student/overlap-warning', () => ({ StudentOverlapWarning: () => null }));
vi.mock('@/features/groups/announcement-view', () => ({ AnnouncementView: () => null }));
vi.mock('@/features/student/share-domain', () => ({ canSharePublicGroup: () => true }));
vi.mock('@/features/student/domain', () => ({ canRequest: () => true }));
vi.mock('@/features/teacher/catalogue-domain', () => ({
  catalogueDisplayName: () => 'Mathematics',
}));

import GroupDetail from '@/app/[locale]/groups/[id]/page';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('public group detail independent reads', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('starts learning, announcement, enrollment, saved-status, and waitlist reads together for an active student', async () => {
    const pending = deferred<unknown>();
    const saved = deferred<unknown>();
    const announcement = deferred<unknown>();
    const learning = deferred<unknown>();
    const started = new Set<string>();
    const waitlistQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    waitlistQuery.select.mockReturnValue(waitlistQuery);
    waitlistQuery.eq.mockReturnValue(waitlistQuery);
    mocks.classDetail.mockResolvedValue({
      group: {
        id: 'group-1',
        name: 'Algebra',
        status: 'published',
        offering: null,
        next_lesson_at: null,
        available_seats: 3,
        description: '',
        capacity: 10,
        location: '',
        teacher_id: 'teacher-1',
      },
      slots: [],
      teacher: null,
      publiclyEligible: true,
    });
    mocks.viewer.mockResolvedValue({
      user: { id: 'student-1' },
      profile: { role: 'student', status: 'active' },
      db: {
        from: vi.fn(() => {
          started.add('waitlist');
          return waitlistQuery;
        }),
      },
    });
    mocks.enrollment.mockImplementation(() => {
      started.add('enrollment');
      return pending.promise;
    });
    mocks.saved.mockImplementation(() => {
      started.add('saved');
      return saved.promise;
    });
    mocks.announcement.mockImplementation(() => {
      started.add('announcement');
      return announcement.promise;
    });
    mocks.learning.mockImplementation(() => {
      started.add('learning');
      return learning.promise;
    });

    const result = GroupDetail({ params: Promise.resolve({ locale: 'en', id: 'group-1' }) });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(started).toEqual(
      new Set(['announcement', 'enrollment', 'saved', 'learning', 'waitlist']),
    );

    pending.resolve({ status: null });
    saved.resolve(false);
    announcement.resolve(null);
    learning.resolve({ data: {}, error: null });
    await expect(result).resolves.toBeTruthy();
  });

  it.each([
    ['missing', null],
    [
      'unpublished',
      {
        group: { id: 'group-1', name: 'Draft', status: 'draft', offering: null },
        slots: [],
        teacher: null,
        publiclyEligible: false,
      },
    ],
  ] as const)('starts no private follow-up reads for a %s group', async (_case, detail) => {
    mocks.classDetail.mockResolvedValue(detail);
    mocks.viewer.mockResolvedValue({
      user: { id: 'student-1' },
      profile: { role: 'student', status: 'active' },
      db: {},
    });
    await expect(
      GroupDetail({ params: Promise.resolve({ locale: 'en', id: 'group-1' }) }),
    ).rejects.toThrow('notFound');
    expect(mocks.announcement).not.toHaveBeenCalled();
    expect(mocks.enrollment).not.toHaveBeenCalled();
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.learning).not.toHaveBeenCalled();
  });
});
