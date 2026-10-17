export type FileObject = { bucket_id: string; name: string };
export type QueueRow = { request_id: string; user_id: string; manifest: unknown; state: string; lease_token: string };

export type ProcessorPorts = {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
  remove(bucket: string, names: string[]): Promise<void>;
  getUser(userId: string): Promise<{ exists: boolean; error?: 'not_found' | 'failed' }>;
  deleteUser(userId: string): Promise<void>;
};

const MAX_FILES_PER_PASS = 100;

async function removeFiles(ports: ProcessorPorts, files: FileObject[]) {
  const byBucket = new Map<string, string[]>();
  for (const file of files) {
    if (!file || typeof file.bucket_id !== 'string' || typeof file.name !== 'string' || !file.name) throw new Error('invalid_manifest');
    const names = byBucket.get(file.bucket_id) ?? [];
    names.push(file.name);
    byBucket.set(file.bucket_id, names);
  }
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += MAX_FILES_PER_PASS) await ports.remove(bucket, names.slice(i, i + MAX_FILES_PER_PASS));
  }
}

export async function processDeletionRequest(ports: ProcessorPorts, row: QueueRow): Promise<'completed' | 'pending'> {
  try {
    for (let pass = 0; pass < 20; pass++) {
      const files = await ports.rpc<FileObject[]>('account_deletion_files', { p_request_id: row.request_id, p_lease_token: row.lease_token });
      if (!Array.isArray(files)) throw new Error('invalid_file_manifest');
      if (files.length === 0) break;
      try { await removeFiles(ports, files); }
      catch {
        // Removal is idempotent; re-read the scoped manifest before treating failure as actionable.
        const remaining = await ports.rpc<FileObject[]>('account_deletion_files', { p_request_id: row.request_id, p_lease_token: row.lease_token });
        if (!Array.isArray(remaining) || remaining.length > 0) throw new Error('storage_cleanup_failed');
        break;
      }
      if (pass === 19) throw new Error('storage_cleanup_incomplete');
    }

    await ports.rpc('account_deletion_progress', { p_request_id: row.request_id, p_lease_token: row.lease_token, p_state: 'auth_pending', p_safe_error: null });
    const existing = await ports.getUser(row.user_id);
    if (existing.error && existing.error !== 'not_found') throw new Error('auth_lookup_failed');
    if (existing.exists) await ports.deleteUser(row.user_id);
    const confirmed = await ports.getUser(row.user_id);
    if (confirmed.error && confirmed.error !== 'not_found') throw new Error('auth_confirm_failed');
    if (confirmed.exists) throw new Error('auth_delete_unconfirmed');
    await ports.rpc('account_deletion_progress', { p_request_id: row.request_id, p_lease_token: row.lease_token, p_state: 'completed', p_safe_error: null });
    return 'completed';
  } catch {
    try { await ports.rpc('account_deletion_progress', { p_request_id: row.request_id, p_lease_token: row.lease_token, p_state: 'storage_pending', p_safe_error: 'cleanup_retry_required' }); } catch { /* Queue remains durable and lease will expire. */ }
    return 'pending';
  }
}
