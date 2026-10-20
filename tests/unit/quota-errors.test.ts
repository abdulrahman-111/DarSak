import { describe, expect, it } from 'vitest';
import { quotaErrorMessage } from '@/features/subscriptions/quota-errors';

describe('teacher plan quota error messages', () => {
  it('maps known group and storage limits to actionable English and Arabic copy', () => {
    expect(quotaErrorMessage('en', 'teacher group quota reached')).toContain('archive a group');
    expect(quotaErrorMessage('ar', 'RPC failed: teacher group quota reached')).toContain(
      'أرشف مجموعة',
    );
    expect(quotaErrorMessage('en', 'teacher storage quota reached')).toContain(
      'delete lesson files',
    );
    expect(quotaErrorMessage('ar', 'teacher storage quota reached')).toContain('احذف ملفات');
  });

  it('explains when an active plan is required and leaves unrelated errors unmapped', () => {
    expect(quotaErrorMessage('en', 'teacher subscription required')).toContain(
      'active teacher plan',
    );
    expect(quotaErrorMessage('ar', 'teacher subscription required')).toContain('خطة مدرس نشطة');
    expect(quotaErrorMessage('en', 'permission denied')).toBeNull();
  });
});
