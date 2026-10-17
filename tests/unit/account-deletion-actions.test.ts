import { beforeEach, describe, expect, it, vi } from 'vitest';
const { edgeMock, createClientMock, isConfiguredMock, cookiesMock } = vi.hoisted(() => ({ edgeMock: vi.fn(), createClientMock: vi.fn(), isConfiguredMock: vi.fn(), cookiesMock: vi.fn() }));
vi.mock('@/features/account/edge', () => ({ callDeletionEdge: edgeMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock, isConfigured: isConfiguredMock }));
vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('server-only', () => ({}));

import { deleteAccount } from '@/features/account/actions';

describe('account deletion confirmation', () => {
  beforeEach(() => { edgeMock.mockReset(); createClientMock.mockReset(); isConfiguredMock.mockReturnValue(true); cookiesMock.mockReset(); });

  it('rejects an unchecked warning before contacting the deletion service', async () => {
    const form = new FormData(); form.set('confirmation', 'DELETE');
    const result = await deleteAccount('en', null, form);
    expect(result?.error).toMatch(/confirm the warning/i);
    expect(edgeMock).not.toHaveBeenCalled();
  });

  it('requires the exact uppercase word DELETE', async () => {
    const form = new FormData(); form.set('acknowledged', 'on'); form.set('confirmation', 'delete');
    const result = await deleteAccount('en', null, form);
    expect(result?.error).toMatch(/Type DELETE/i);
    expect(edgeMock).not.toHaveBeenCalled();
  });
});
