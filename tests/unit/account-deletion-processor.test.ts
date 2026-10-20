import { describe, expect, it, vi } from 'vitest';
import {
  processDeletionRequest,
  type ProcessorPorts,
  type QueueRow,
} from '../../supabase/functions/delete-account/processor';

const row: QueueRow = {
  request_id: 'request-1',
  user_id: 'owner-1',
  manifest: null,
  state: 'queued',
  lease_token: 'lease-1',
};

describe('durable account deletion processor', () => {
  it('keeps the request pending when storage removal fails and writes progress under its lease', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const ports: ProcessorPorts = {
      rpc: vi.fn(async <T>(name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (name === 'account_deletion_files')
          return [{ bucket_id: 'teacher-avatars', name: 'owner-1/avatar.png' }] as T;
        return undefined as T;
      }) as unknown as ProcessorPorts['rpc'],
      remove: vi.fn(async () => {
        throw new Error('storage unavailable');
      }),
      getUser: vi.fn(async () => ({ exists: true })),
      deleteUser: vi.fn(async () => {}),
    };
    expect(await processDeletionRequest(ports, row)).toBe('pending');
    expect(ports.deleteUser).not.toHaveBeenCalled();
    expect(rpcCalls.at(-1)).toEqual({
      name: 'account_deletion_progress',
      args: {
        p_request_id: 'request-1',
        p_lease_token: 'lease-1',
        p_state: 'storage_pending',
        p_safe_error: 'cleanup_retry_required',
      },
    });
    expect(
      rpcCalls.every(
        ({ args }) => args.p_request_id === 'request-1' && args.p_lease_token === 'lease-1',
      ),
    ).toBe(true);
  });

  it('rechecks the manifest, hard deletes Auth, and marks complete only after Auth confirms absence', async () => {
    let fileReads = 0;
    let userExists = true;
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const ports: ProcessorPorts = {
      rpc: vi.fn(async <T>(name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (name === 'account_deletion_files')
          return (
            fileReads++ === 0 ? [{ bucket_id: 'lesson-materials', name: 'owner-1/file.pdf' }] : []
          ) as T;
        return undefined as T;
      }) as unknown as ProcessorPorts['rpc'],
      remove: vi.fn(async () => {}),
      getUser: vi.fn(async () => ({ exists: userExists })),
      deleteUser: vi.fn(async () => {
        userExists = false;
      }),
    };
    expect(await processDeletionRequest(ports, row)).toBe('completed');
    expect(ports.remove).toHaveBeenCalledWith('lesson-materials', ['owner-1/file.pdf']);
    expect(ports.deleteUser).toHaveBeenCalledWith('owner-1');
    expect(rpcCalls.at(-1)).toEqual({
      name: 'account_deletion_progress',
      args: {
        p_request_id: 'request-1',
        p_lease_token: 'lease-1',
        p_state: 'completed',
        p_safe_error: null,
      },
    });
  });

  it('treats a missing Auth user as idempotent success only after scoped file cleanup', async () => {
    const ports: ProcessorPorts = {
      rpc: vi.fn(
        async <T>(name: string, _args: Record<string, unknown>) =>
          (name === 'account_deletion_files' ? [] : undefined) as T,
      ) as unknown as ProcessorPorts['rpc'],
      remove: vi.fn(async () => {}),
      getUser: vi.fn(async () => ({ exists: false, error: 'not_found' as const })),
      deleteUser: vi.fn(async () => {}),
    };
    expect(await processDeletionRequest(ports, row)).toBe('completed');
    expect(ports.deleteUser).not.toHaveBeenCalled();
  });
});
