import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  config: {
    apiKey: 'secret',
    allowedUserIds: new Set(['11111111-1111-4111-8111-111111111111']),
    allowedOrigins: new Set(['https://pilot.example']),
  } as null | { apiKey: string; allowedUserIds: Set<string>; allowedOrigins: Set<string> },
  viewer: {
    db: {},
    user: { id: '11111111-1111-4111-8111-111111111111' },
    profile: { status: 'active', role: 'student' },
  } as any,
  teaching: { allowed: true } as { allowed: boolean },
  reservation: { lease: 'lease', failed: false } as { lease: string | null; failed: boolean },
}));
const mocks = vi.hoisted(() => ({
  generateChat: vi.fn(),
  generateGroupDraft: vi.fn(),
  getRequestViewer: vi.fn(),
  checkTeachingAccess: vi.fn(),
  getSanadConfig: vi.fn(),
  reserveSanadRequest: vi.fn(),
  releaseSanadRequest: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/features/assistant/config', () => ({ getSanadConfig: mocks.getSanadConfig }));
vi.mock('@/features/assistant/provider', () => ({
  generateChat: mocks.generateChat,
  generateGroupDraft: mocks.generateGroupDraft,
}));
vi.mock('@/features/assistant/quota', () => ({
  reserveSanadRequest: mocks.reserveSanadRequest,
  releaseSanadRequest: mocks.releaseSanadRequest,
}));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/teacher-access/guard', () => ({
  checkTeachingAccess: mocks.checkTeachingAccess,
}));
import { GET, POST } from '@/app/api/assistant/route';

const chat = {
  mode: 'chat',
  locale: 'en',
  acknowledged: true,
  messages: [{ role: 'user', text: 'hello' }],
};
function request(body: unknown, origin = 'https://pilot.example') {
  return new NextRequest('https://pilot.example/api/assistant', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.config = {
    apiKey: 'secret',
    allowedUserIds: new Set(['11111111-1111-4111-8111-111111111111']),
    allowedOrigins: new Set(['https://pilot.example']),
  };
  state.viewer = {
    db: {},
    user: { id: '11111111-1111-4111-8111-111111111111' },
    profile: { status: 'active', role: 'student' },
  };
  state.teaching = { allowed: true };
  state.reservation = { lease: 'lease', failed: false };
  mocks.getSanadConfig.mockImplementation(() => state.config);
  mocks.getRequestViewer.mockImplementation(async () => state.viewer);
  mocks.checkTeachingAccess.mockImplementation(async () => state.teaching);
  mocks.reserveSanadRequest.mockImplementation(async () => state.reservation);
  mocks.releaseSanadRequest.mockResolvedValue(undefined);
  mocks.generateChat.mockResolvedValue('hello');
  mocks.generateGroupDraft.mockResolvedValue({
    name: 'Math',
    description: '',
    outcomes: '',
    prerequisites: '',
  });
  vi.clearAllMocks();
});

describe('Sanad endpoint guards', () => {
  it('exposes only a boolean for a verified active allowlisted user', async () => {
    expect(await (await GET()).json()).toEqual({ available: true });
    state.viewer.profile.status = 'suspended';
    expect(await (await GET()).json()).toEqual({ available: false });
    state.config = null;
    expect(await (await GET()).json()).toEqual({ available: false });
  });

  it('rejects cross-origin and invalid schemas before auth, quota, and provider', async () => {
    const csrf = await POST(request(chat, 'https://attacker.example'));
    const invalid = await POST(request({ ...chat, role: 'admin' }));
    const oversized = await POST(request({ ...chat, padding: 'x'.repeat(25 * 1024) }));
    expect(csrf.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
    expect(mocks.reserveSanadRequest).not.toHaveBeenCalled();
    expect(mocks.generateChat).not.toHaveBeenCalled();
  });

  it('enforces streamed size even when Content-Length is absent', async () => {
    const body = JSON.stringify({ ...chat, padding: 'x'.repeat(25 * 1024) });
    const oversized = new NextRequest('https://pilot.example/api/assistant', {
      method: 'POST',
      headers: { origin: 'https://pilot.example', 'content-type': 'application/json' },
      body,
    });
    expect(oversized.headers.has('content-length')).toBe(false);
    expect((await POST(oversized)).status).toBe(400);
    expect(mocks.getRequestViewer).not.toHaveBeenCalled();
  });

  it('returns the chat contract and supplies only role-filtered authored platform topics', async () => {
    const req = request(chat);
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, mode: 'chat', text: 'hello' });
    expect(mocks.releaseSanadRequest).toHaveBeenCalledWith(state.viewer.db, 'lease');
    const topics = mocks.generateChat.mock.calls[0][2] as string;
    expect(mocks.generateChat.mock.calls[0][3]).toBe(req.signal);
    expect(topics).toContain('Requests and classes');
    expect(topics).not.toContain('Create and manage groups');
  });

  it('requires a fresh authenticated active profile and pilot allowlist membership', async () => {
    state.viewer = { ...state.viewer, user: null };
    expect((await POST(request(chat))).status).toBe(401);
    state.viewer = {
      ...state.viewer,
      user: { id: '11111111-1111-4111-8111-111111111111' },
      profile: { status: 'suspended', role: 'student' },
    };
    expect((await POST(request(chat))).status).toBe(401);
    state.viewer = {
      db: {},
      user: { id: '22222222-2222-4222-8222-222222222222' },
      profile: { status: 'active', role: 'student' },
    };
    expect((await POST(request(chat))).status).toBe(503);
    expect(mocks.reserveSanadRequest).not.toHaveBeenCalled();
  });

  it('blocks student draft requests and rejects exhausted quota', async () => {
    const draft = {
      mode: 'group_draft',
      acknowledged: true,
      locale: 'en',
      topic: 'Math',
      level: 'beginner',
      format: 'online',
      guidance: '',
    };
    expect((await POST(request(draft))).status).toBe(503);
    state.viewer.profile.role = 'teacher';
    state.reservation = { lease: null, failed: false };
    expect((await POST(request(draft))).status).toBe(429);
    expect(mocks.generateGroupDraft).not.toHaveBeenCalled();
  });

  it('requires current teaching access for an allowlisted teacher draft', async () => {
    const draft = {
      mode: 'group_draft',
      acknowledged: true,
      locale: 'en',
      topic: 'Math',
      level: 'beginner',
      format: 'online',
      guidance: '',
    };
    state.viewer.profile.role = 'teacher';
    state.teaching = { allowed: false };
    expect((await POST(request(draft))).status).toBe(503);
    expect(mocks.reserveSanadRequest).not.toHaveBeenCalled();
    expect(mocks.generateGroupDraft).not.toHaveBeenCalled();
  });

  it('fails closed when the quota RPC fails', async () => {
    state.reservation = { lease: null, failed: true };
    expect((await POST(request(chat))).status).toBe(503);
    expect(mocks.generateChat).not.toHaveBeenCalled();
  });

  it('returns generic provider errors and releases its quota lease', async () => {
    mocks.generateChat.mockRejectedValue(new Error('raw provider secret error'));
    const response = await POST(request(chat));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: 'provider_unavailable' });
    expect(mocks.releaseSanadRequest).toHaveBeenCalledWith(state.viewer.db, 'lease');
  });
});
