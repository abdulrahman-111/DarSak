import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTeacherVisitorView, TeacherProfile } from '@/components/public/teacher-profile';
import { emptyRichProfile, publicVisitorContacts, visiblePublicTeacherProfile, type PublicTeacherVisitorContacts } from '@/features/teacher/profile-details-domain';

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

  it('owner preview includes only contact values explicitly filtered as public', () => {
    const publicContacts = publicVisitorContacts('public', enrolledContacts);
    const publicView = buildTeacherVisitorView({
      teacher,
      details: null,
      contactVisibility: 'public',
      contacts: publicContacts,
      specializations: [],
      groups: [],
      avatarUrl: null,
      coverUrl: null,
    });
    const privateView = buildTeacherVisitorView({
      teacher,
      details: null,
      contactVisibility: 'enrolled',
      contacts: publicVisitorContacts('enrolled', enrolledContacts),
      specializations: [],
      groups: [],
      avatarUrl: null,
      coverUrl: null,
    });

    expect(publicView.contacts).toEqual(enrolledContacts);
    expect(privateView.contacts).toBeNull();
    expect(JSON.stringify(privateView)).not.toContain('+201234567890');
  });

  it('renders valid unbroken teacher text with safe wrapping and localized fallback', () => {
    const longTitle = 'T'.repeat(120);
    const longOrganization = 'O'.repeat(120);
    const longDescription = 'D'.repeat(1_500);
    const aboutFallback = 'A'.repeat(500);
    const details = visiblePublicTeacherProfile({
      ...emptyRichProfile(),
      about: { ar: '', en: aboutFallback },
      city: { ar: 'مدينة', en: 'C'.repeat(120) },
      languages: ['L'.repeat(60)],
      qualifications: [{
        id: 'long-qualification',
        title: { ar: '', en: longTitle },
        organization: { ar: '', en: longOrganization },
        description: { ar: '', en: longDescription },
        start_year: null,
        end_year: null,
        current: false,
      }],
    });
    const view = buildTeacherVisitorView({
      teacher: { ...teacher, headline: 'H'.repeat(160) },
      details,
      specializations: [],
      groups: [],
      avatarUrl: null,
      coverUrl: null,
    });
    const markup = renderToStaticMarkup(createElement(TeacherProfile, { view, locale: 'ar', backLabel: 'العودة' }));

    expect(markup).toContain('[overflow-wrap:anywhere]');
    expect(markup).toContain(longTitle);
    expect(markup).toContain(longOrganization);
    expect(markup).toContain(longDescription);
    expect(markup).toContain(aboutFallback);
    expect(markup).toContain('المدينة:');
    expect(markup).toContain('لغات التدريس:');
    expect(markup).toContain('قدّم المعلم هذه المعلومات، ولا تتحقق درسك من المؤهلات.');
  });

  it('shows the unverified qualification note only when qualifications are visible', () => {
    const qualification = {
      id: 'q1',
      title: { ar: 'مؤهل', en: 'Qualification' },
      organization: { ar: '', en: '' },
      description: { ar: '', en: '' },
      start_year: null,
      end_year: null,
      current: false,
    };
    const visible = visiblePublicTeacherProfile({ ...emptyRichProfile(), qualifications: [qualification] });
    const hidden = visiblePublicTeacherProfile({
      ...emptyRichProfile(),
      qualifications: [qualification],
      hidden_sections: ['qualifications'],
    });
    const render = (details: ReturnType<typeof visiblePublicTeacherProfile>) => {
      const view = buildTeacherVisitorView({ teacher, details, specializations: [], groups: [], avatarUrl: null, coverUrl: null });
      return renderToStaticMarkup(createElement(TeacherProfile, { view, locale: 'en', backLabel: 'Back' }));
    };

    expect(render(visible)).toContain('DarSak does not verify qualifications.');
    expect(render(hidden)).not.toContain('DarSak does not verify qualifications.');
  });

  it('shows a localized unavailable-enrollment state when public group projections are empty',()=>{
    const view=buildTeacherVisitorView({teacher,details:null,specializations:[],groups:[],avatarUrl:null,coverUrl:null});
    const en=renderToStaticMarkup(createElement(TeacherProfile,{view,locale:'en',backLabel:'Back'}));
    const ar=renderToStaticMarkup(createElement(TeacherProfile,{view,locale:'ar',backLabel:'عودة'}));
    expect(en).toContain('No groups available for enrollment.');
    expect(ar).toContain('لا توجد مجموعات متاحة للتسجيل.');
    expect(en).not.toContain('View group details');
  });
});
