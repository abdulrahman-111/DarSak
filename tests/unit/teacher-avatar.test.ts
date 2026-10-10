import { describe, expect, it } from 'vitest';
import { avatarPathIsCurrent, publicTeacherContactLinks, storageRemovalConfirmed, teacherAvatarExtension, teacherAvatarPath } from '@/features/teacher/profile-domain';

describe('teacher avatar rules', () => {
  it('accepts only non-empty JPEG, PNG, and WebP images up to 2 MiB', () => {
    expect(teacherAvatarExtension({ type: 'image/jpeg', size: 2_097_152 })).toBe('jpg');
    expect(teacherAvatarExtension({ type: 'image/png', size: 12 })).toBe('png');
    expect(teacherAvatarExtension({ type: 'image/webp', size: 12 })).toBe('webp');
    expect(teacherAvatarExtension({ type: 'image/gif', size: 12 })).toBeNull();
    expect(teacherAvatarExtension({ type: 'image/jpeg', size: 0 })).toBeNull();
    expect(teacherAvatarExtension({ type: 'image/jpeg', size: 2_097_153 })).toBeNull();
  });

  it('builds owner-scoped random UUID object paths with supported extensions', () => {
    expect(teacherAvatarPath('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'image/jpeg'))
      .toBe('11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg');
    expect(() => teacherAvatarPath('invalid', '22222222-2222-4222-8222-222222222222', 'image/jpeg')).toThrow();
    expect(() => teacherAvatarPath('11111111-1111-4111-8111-111111111111', 'invalid', 'image/jpeg')).toThrow();
    expect(() => teacherAvatarPath('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'image/gif')).toThrow();
  });
});

describe('public teacher contact links', () => {
  it('creates safe phone, WhatsApp, and email links from valid stored contact values', () => {
    expect(publicTeacherContactLinks({ phone_number: '+201234567890', whatsapp_number: '+447123456789', contact_email: 'teacher@example.org' }))
      .toEqual({ phone: 'tel:+201234567890', whatsapp: 'https://wa.me/447123456789', email: 'mailto:teacher@example.org' });
  });

  it('omits malformed contact values instead of creating unsafe links', () => {
    expect(publicTeacherContactLinks({ phone_number: '01012345678', whatsapp_number: '+01234567890', contact_email: 'hello@example.org\r\nBcc:evil@example.org' }))
      .toEqual({ phone: null, whatsapp: null, email: null });
  });
});

describe('teacher avatar deletion confirmation', () => {
  it('requires Storage to return the exact deleted object path', () => {
    expect(storageRemovalConfirmed('teacher/photo.jpg', [{ name: 'teacher/photo.jpg' }], null)).toBe(true);
    expect(storageRemovalConfirmed('teacher/photo.jpg', [], null)).toBe(false);
    expect(storageRemovalConfirmed('teacher/photo.jpg', [{ name: 'teacher/another.jpg' }], null)).toBe(false);
    expect(storageRemovalConfirmed('teacher/photo.jpg', null, new Error('delete denied'))).toBe(false);
  });
});

describe('avatar metadata verification', () => {
  it('confirms whether a profile currently references an uploaded object', () => {
    expect(avatarPathIsCurrent('teacher/new.jpg', 'teacher/new.jpg')).toBe(true);
    expect(avatarPathIsCurrent('teacher/new.jpg', 'teacher/old.jpg')).toBe(false);
    expect(avatarPathIsCurrent('teacher/new.jpg', null)).toBe(false);
  });
});
