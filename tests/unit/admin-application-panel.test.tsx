import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/platform/ui', () => ({ Panel: ({ children }: any) => <section>{children}</section>, cairoDate: () => 'date' }));
vi.mock('@/features/admin/application-forms', () => ({
  ApplicationCvDownload: () => <button>Private CV action</button>,
  RequestApplicationChangesForm: () => <button>Request changes action</button>,
}));

import { TeacherApplicationPanel } from '@/features/admin/application-panel';

const id = '11111111-1111-4111-8111-111111111111';
const details = {
  about: { en: 'Frozen biography', ar: '' }, approach: { en: 'A patient approach to learning.', ar: '' }, goals: { en: '', ar: '' },
  qualifications: [{ id: 'q', title: { en: 'BEd', ar: '' }, organization: { en: 'University', ar: '' }, description: { en: '', ar: '' }, start_year: 2010, end_year: 2014, current: false }],
  experience: [{ id: 'e', title: { en: 'Tutor', ar: '' }, organization: { en: 'Independent', ar: '' }, description: { en: 'Worked with learners.', ar: '' }, start_year: 2015, end_year: null, current: true }],
  languages: ['English'], city: { en: '', ar: '' }, teaching_mode: 'online', layout: 'classic', palette: 'teal',
  section_order: ['about', 'qualifications', 'experience', 'approach', 'goals'], hidden_sections: [],
};
const application = {
  teacher_id: id, status: 'submitted' as const, teaching_years: 8, admin_phone: '+20123456789', cv_path: `${id}/cv.pdf`,
  supporting_links: ['https://example.com/portfolio'], attested: true,
  snapshot: { full_name: 'Ada Teacher', headline: 'Math educator', specializations: [{ id: 'math', label_en: 'Math · Primary', label_ar: 'رياضيات · ابتدائي' }], profile_details: details, teaching_years: 8, admin_phone: '+20123456789', supporting_links: ['https://example.com/portfolio'], cv_path: `${id}/cv.pdf`, attested: true },
  feedback: 'Please review the attached CV.', submitted_at: '2026-10-01', reviewed_at: '2026-10-02', reviewed_by: id, updated_at: '2026-10-02', legacy_approved: false,
};

describe('admin submitted teacher application panel', () => {
  it('renders the frozen snapshot, private fields, feedback, and application actions', () => {
    const html = renderToStaticMarkup(<TeacherApplicationPanel locale="en" application={application} missing={[]} requestId="22222222-2222-4222-8222-222222222222"/>);
    for (const value of ['Frozen submitted application snapshot', 'Ada Teacher', 'Math · Primary', 'BEd', '2010 – 2014', 'Tutor', '2015 – Present', 'A patient approach', 'English', '+20123456789', '8', 'https://example.com/portfolio', 'Please review the attached CV.', 'Private CV action', 'Request changes action']) expect(html).toContain(value);
    expect(html).not.toContain('teacher-applications');
    expect(html).not.toContain('signedUrl');
  });

  it('keeps draft applications visibly unsubmitted and offers no approval or CV controls', () => {
    const html = renderToStaticMarkup(<TeacherApplicationPanel locale="en" application={{ ...application, status: 'draft', snapshot: null, submitted_at: null }} missing={['cv', 'attestation']} requestId="22222222-2222-4222-8222-222222222222"/>);
    expect(html).toContain('Unsubmitted draft');
    expect(html).toContain('CV PDF');
    expect(html).not.toContain('Private CV action');
    expect(html).not.toContain('Request changes action');
  });

  it('explains grandfathered approvals without claiming new requirements are complete', () => {
    const legacy = { ...application, status: 'approved' as const, legacy_approved: true, snapshot: null };
    const english = renderToStaticMarkup(<TeacherApplicationPanel locale="en" application={legacy} missing={[]} requestId={null}/>);
    expect(english).toContain('Existing approved account; new application requirements do not change its approval. No new application snapshot was required.');
    expect(english).not.toContain('All recorded requirements are complete.');
    const arabic = renderToStaticMarkup(<TeacherApplicationPanel locale="ar" application={legacy} missing={[]} requestId={null}/>);
    expect(arabic).toContain('حساب معتمد سابقًا');
    expect(arabic).not.toContain('اكتملت المتطلبات المسجلة.');
  });
});
