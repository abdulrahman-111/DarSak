import { describe, expect, it } from 'vitest';
import {
  announcementLength,
  announcementText,
  validateAnnouncement,
} from '@/features/groups/announcement-domain';

describe('group announcement bounds', () => {
  it('counts Unicode code points like PostgreSQL char_length', () => {
    expect(announcementLength('مرحبا 👋')).toBe(7);
    expect(validateAnnouncement('ا'.repeat(2000))).toBeNull();
    expect(validateAnnouncement('😀'.repeat(2000))).toBeNull();
    expect(validateAnnouncement('😀'.repeat(2001))).toBe('too_long');
  });

  it('rejects non-text input and preserves plain text unchanged', () => {
    expect(validateAnnouncement(null)).toBe('invalid');
    expect(announcementText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});
