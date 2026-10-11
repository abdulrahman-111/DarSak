import { describe, expect, it } from 'vitest';
import { buildTeacherVisitorView } from '@/components/public/teacher-profile';
import { emptyRichProfile, visiblePublicTeacherProfile, type PublicTeacherVisitorContacts } from '@/features/teacher/profile-details-domain';

const teacher = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Mona Ali', headline: null };
const enrolledContacts: PublicTeacherVisitorContacts = {
  phone_number: '+201234567890',
  whatsapp_number: null,
  contact_email: 'mona@example.org',
};

describe('shared teacher visitor projection', () => {
  it('preview includes only explicitly public contacts and visible profile sections', () => {
    const details = visiblePublicTeacherProfile({
      ...emptyRichProfile(),
      about: { ar: 'خاص', en: 'Hidden text' },
      hidden_sections: ['about'],
    });
    const view = buildTeacherVisitorView({
      teacher,
      details,
      contactVisibility: 'enrolled',
      contacts: enrolledContacts,
      contactPolicy: 'public-only',
      specializations: [],
      groups: [],
      avatarUrl: null,
      coverUrl: null,
    });

    expect(view.contacts).toBeNull();
    expect(view.details?.sections).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('Hidden text');
  });

  it('preserves contacts returned by viewer-authorized RLS on the public page', () => {
    const view = buildTeacherVisitorView({
      teacher,
      details: null,
      contactVisibility: 'enrolled',
      contacts: enrolledContacts,
      contactPolicy: 'viewer-authorized',
      specializations: [],
      groups: [],
      avatarUrl: null,
      coverUrl: null,
    });

    expect(view.contacts).toEqual(enrolledContacts);
  });
});
