import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  getRequestViewer: vi.fn(),
  unreadNotificationCount: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ isConfigured: mocks.isConfigured }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/notifications/data', () => ({ unreadNotificationCount: mocks.unreadNotificationCount }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...props }, children) }));
vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => createElement('img', props) }));
vi.mock('@/components/active-link', () => ({ ActiveLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...props }, children) }));

import { OptionalWorkspaceLayout } from '@/components/platform/optional-workspace-layout';

describe('optional workspace layout', () => {
  beforeEach(() => {
    mocks.isConfigured.mockReset().mockReturnValue(true);
    mocks.getRequestViewer.mockReset();
    mocks.unreadNotificationCount.mockReset().mockResolvedValue(6);
  });

  it('uses the active student, teacher, and admin shell with one unread count', async () => {
    for (const role of ['student', 'teacher', 'admin'] as const) {
      mocks.getRequestViewer.mockResolvedValueOnce({
        db: {},
        user: { id: `${role}-id` },
        profile: { role, status: 'active', full_name: `${role} name` },
      });
      const html = renderToStaticMarkup(await OptionalWorkspaceLayout({ locale: 'en', children: createElement('p', null, 'Content') }));
      expect(html).toContain(`${role === 'student' ? 'Student' : role === 'teacher' ? 'Teacher' : 'Administration'} navigation`);
      expect(html).toContain('6 unread');
    }
    expect(mocks.unreadNotificationCount).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['guest', { db: {}, user: null, profile: null }],
    ['inactive profile', { db: {}, user: { id: 'inactive' }, profile: { role: 'student', status: 'suspended' } }],
    ['unknown role', { db: {}, user: { id: 'other' }, profile: { role: 'owner', status: 'active' } }],
  ])('keeps %s on the public layout without sidebar or notification query', async (_label, viewer) => {
    mocks.getRequestViewer.mockResolvedValue(viewer);
    const html = renderToStaticMarkup(await OptionalWorkspaceLayout({ locale: 'en', children: createElement('p', null, 'Content') }));
    expect(html).toContain('Content');
    expect(html).not.toContain('navigation');
    expect(mocks.unreadNotificationCount).not.toHaveBeenCalled();
  });

  it('keeps public content unwrapped when Supabase is not configured', async () => {
    mocks.isConfigured.mockReturnValue(false);
    const html = renderToStaticMarkup(await OptionalWorkspaceLayout({ locale: 'en', children: createElement('p', null, 'Goodbye') }));
    expect(html).toContain('Goodbye');
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
    expect(mocks.unreadNotificationCount).not.toHaveBeenCalled();
  });
});
