import { describe, expect, it } from 'vitest';
import { normalizeReportPagePath, parseAdminReportPage } from '@/features/reports/domain';

describe('problem report page paths', () => {
  it('keeps only the pathname from pasted URLs', () => {
    expect(normalizeReportPagePath('https://example.test/en/reports?token=secret#section')).toBe('/en/reports');
  });
  it('normalizes relative routes and removes query strings and fragments', () => {
    expect(normalizeReportPagePath('student/classes?invite=secret#active')).toBe('/student/classes');
  });
  it('drops malformed, unsafe, control-character, and oversized values', () => {
    expect(normalizeReportPagePath('javascript:alert(1)')).toBe('');
    expect(normalizeReportPagePath('//example.test/path')).toBe('');
    expect(normalizeReportPagePath('/bad\\path')).toBe('');
    expect(normalizeReportPagePath('/bad\npath')).toBe('');
    expect(normalizeReportPagePath(`/${'x'.repeat(500)}`)).toBe('');
  });
});

describe('admin problem report RPC response', () => {
  it('accepts the bounded report rows shape including reporter context and private note', () => {
    expect(parseAdminReportPage({ total: 1, rows: [{ id: 'id', reporter_id: 'reporter', reporter_name: 'Sam', reporter_role: 'teacher', subject: 'Broken page', description: 'Expected to save but it failed.', status: 'open', page_path: '/en/teacher', admin_note: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] })?.rows[0].reporter_name).toBe('Sam');
  });
  it('rejects malformed rows instead of rendering partial RPC data', () => {
    expect(parseAdminReportPage({ total: 0, rows: [{ id: 'x' }] })).toBeNull();
    expect(parseAdminReportPage({ total: -1, rows: [] })).toBeNull();
  });
});
