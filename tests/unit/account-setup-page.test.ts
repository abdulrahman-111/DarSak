import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
const { viewer, setupData } = vi.hoisted(() => ({ viewer: vi.fn(), setupData: vi.fn() }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: viewer }));
vi.mock('@/features/setup/data', () => ({ accountSetupData: setupData }));
vi.mock('@/features/setup/wizard', () => ({ SetupWizard: 'setup-wizard' }));
import AccountSetupPage from '@/app/[locale]/account/setup/page';

describe('Account setup recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewer.mockResolvedValue({ user: { id: 'student' }, profile: { role: 'student', status: 'active' } });
    setupData.mockResolvedValue({ role: 'student', draft: { return_to: '/en/student' }, offerings: [], subjects: [], nodes: [], hasAvatar: false, error: false });
  });
  it.each(['en', 'ar'])('lets a recovered %s setup load despite an earlier auth read-error URL', async locale => {
    const result = await AccountSetupPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ load: 'error' }) });
    const child = (result as ReactElement<{ children: ReactElement<{ loadError: boolean }> }>).props.children;
    expect(child.type).toBe('setup-wizard');
    expect(child.props.loadError).toBe(false);
  });
  it('offers retry without granting a role when the verified account profile cannot load', async () => {
    viewer.mockResolvedValue({ user: { id: 'student' }, profile: null });
    const result = await AccountSetupPage({ params: Promise.resolve({ locale: 'ar' }), searchParams: Promise.resolve({ load: 'error' }) });
    const nodes = Children.toArray((result as ReactElement<{ children: ReactNode }>).props.children).filter(isValidElement);
    expect(setupData).not.toHaveBeenCalled();
    expect(nodes.some(node => node.type === 'a' && (node.props as { href?: string }).href === '/ar/account/setup')).toBe(true);
  });
});
