export const GROUP_ANNOUNCEMENT_MAX_LENGTH = 2000;

/** JavaScript code points match PostgreSQL char_length for Unicode text. */
export function announcementLength(value: string): number {
  return Array.from(value).length;
}

export function validateAnnouncement(value: unknown): string | null {
  if (typeof value !== 'string') return 'invalid';
  return announcementLength(value) <= GROUP_ANNOUNCEMENT_MAX_LENGTH ? null : 'too_long';
}

export function announcementText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
