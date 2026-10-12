import { describe, expect, it } from 'vitest';
import { canSharePublicGroup } from '../../src/features/student/share-domain';

describe('public group sharing gate', () => {
  it('does not treat an authorized published fallback as a public group', () => {
    expect(canSharePublicGroup(false, 'published')).toBe(false);
  });

  it('allows sharing only when the public projection exists for a published group', () => {
    expect(canSharePublicGroup(true, 'published')).toBe(true);
    expect(canSharePublicGroup(true, 'draft')).toBe(false);
  });
});
