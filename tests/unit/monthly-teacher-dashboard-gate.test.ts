import { beforeEach, describe, expect, it, vi } from 'vitest';
const { viewer, status, overview } = vi.hoisted(() => ({
  viewer: vi.fn(),
  status: vi.fn(),
  overview: vi.fn(),
}));
vi.mock('@/components/platform/access', () => ({ requireViewer: viewer }));
vi.mock('@/features/teacher-access/data', () => ({ readTeacherAccessStatus: status }));
vi.mock('@/features/teacher/data', () => ({ teacherOverview: overview }));
vi.mock('@/components/platform/actions', () => ({ EnrollmentDecisionButtons: () => null }));
import TeacherDashboard from '@/app/[locale]/teacher/page';
describe('teacher dashboard access gate', () => {
  beforeEach(() => {
    viewer.mockReset().mockResolvedValue({ db: {}, fullName: 'Teacher' });
    status.mockReset();
    overview.mockReset();
  });
  const text = (node: unknown) => {
    const seen = new WeakSet<object>();
    return JSON.stringify(node, (_key, value) => {
      if (typeof value === 'function') return undefined;
      if (value && typeof value === 'object') {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    });
  };
  const leaked = 'Private Lesson Title';
  const summary = () => ({
    me: { profile: { full_name: 'Sara Teacher' } },
    groups: [],
    nextLesson: {
      id: 'l1',
      group_id: 'g',
      title: leaked,
      starts_at: '2030-01-01T10:00:00Z',
      ends_at: '2030-01-01T11:00:00Z',
      status: 'scheduled',
      group: null,
    },
    todayLessons: [],
    upcomingLessons: [],
    pendingRequests: [],
    counts: { groups: 0, todayLessons: 0, upcomingLessons: 0, pendingRequests: 0 },
    setupTasks: [],
    error: null,
  });
  it('starts the overview with the access check but never renders it when access is expired', async () => {
    overview.mockResolvedValue(summary());
    status.mockResolvedValue({ status: { has_access: false }, error: false });
    const page = await TeacherDashboard({ params: Promise.resolve({ locale: 'en' }) });
    expect(overview).toHaveBeenCalledTimes(1);
    expect(text(page)).not.toContain(leaked);
    expect(page).toBeTruthy();
  });
  it('shows retry state instead of teaching data when access status is unavailable', async () => {
    overview.mockResolvedValue(summary());
    status.mockResolvedValue({ status: null, error: true });
    const page = await TeacherDashboard({ params: Promise.resolve({ locale: 'en' }) });
    expect(text(page)).not.toContain(leaked);
    expect(page).toBeTruthy();
  });
  it('does not wait for the access check before starting the overview', async () => {
    let release!: (value: unknown) => void;
    status.mockReturnValue(new Promise(resolve => (release = resolve)));
    overview.mockResolvedValue(summary());
    const pending = TeacherDashboard({ params: Promise.resolve({ locale: 'en' }) });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(overview).toHaveBeenCalledTimes(1);
    release({ status: { has_access: false }, error: false });
    await pending;
  });
});
