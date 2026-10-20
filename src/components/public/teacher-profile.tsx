import Link from 'next/link';
import { GroupCard } from '@/components/ui';
import { TeacherAvatarImage } from '@/features/teacher/profile-avatar-image';
import { localizedProfileText, publicVisitorContacts, type PublicTeacherProfileDetails, type PublicTeacherVisitorContacts } from '@/features/teacher/profile-details-domain';
import { publicTeacherContactLinks } from '@/features/teacher/profile-domain';
import type { Group } from '@/lib/supabase/types';

export type TeacherVisitorView = {
  teacher: { id: string; full_name: string; headline: string | null };
  details: PublicTeacherProfileDetails | null;
  contacts: PublicTeacherVisitorContacts | null;
  specializations: Array<{ id: string; subject: string; context: string }>;
  groups: Group[];
  avatarUrl: string | null;
  coverUrl: string | null;
};

/** Only contacts returned by viewer-authorized RLS may enter the visitor view. */
export function buildTeacherVisitorView(input: {
  teacher: TeacherVisitorView['teacher'];
  details: PublicTeacherProfileDetails | null;
  contactVisibility?: string | null;
  contacts?: PublicTeacherVisitorContacts | null;
  contactPolicy?: 'viewer-authorized' | 'public-only';
  specializations: TeacherVisitorView['specializations'];
  groups: Group[];
  avatarUrl: string | null;
  coverUrl: string | null;
}): TeacherVisitorView {
  const contacts = input.contactPolicy === 'viewer-authorized'
    ? input.contacts ?? null
    : publicVisitorContacts(input.contactVisibility, input.contacts);
  return {
    teacher: input.teacher,
    details: input.details,
    contacts,
    specializations: input.specializations,
    groups: input.groups.filter(group => group.teacher_id === input.teacher.id && group.status === 'published'),
    avatarUrl: input.avatarUrl,
    coverUrl: input.coverUrl,
  };
}

const paletteClasses = {
  teal: { surface: 'bg-[#f0f8f5]', accent: 'text-teal', border: 'border-[#b9d8cc]' },
  indigo: { surface: 'bg-[#f2f4fb]', accent: 'text-[#344b86]', border: 'border-[#c8d1e8]' },
  olive: { surface: 'bg-[#f5f6ed]', accent: 'text-[#526327]', border: 'border-[#d3d9b8]' },
} as const;

const sectionTitles = {
  en: { about: 'About', qualifications: 'Qualifications', experience: 'Experience', approach: 'Teaching approach', goals: 'Learning goals' },
  ar: { about: 'نبذة', qualifications: 'المؤهلات', experience: 'الخبرة', approach: 'أسلوب التدريس', goals: 'أهداف التعلم' },
} as const;

const visitorLabels = {
  en: { groups: 'Groups', findTutor: 'View group details', noGroups: 'No groups available for enrollment.', subjects: 'Subjects and contexts', noSubjects: 'No specializations have been added yet.', contact: 'Contact this teacher', call: 'Call', whatsapp: 'Message on WhatsApp', email: 'Email', city: 'City', languages: 'Teaching languages', qualificationsDisclosure: 'Provided by the teacher. DarSak does not verify qualifications.', mode: { online: 'Online', in_person: 'In person', both: 'Online and in person' } },
  ar: { groups: 'المجموعات', findTutor: 'عرض تفاصيل المجموعة', noGroups: 'لا توجد مجموعات متاحة للتسجيل.', subjects: 'المواد والسياقات', noSubjects: 'لم يضف المعلم تخصصات بعد.', contact: 'تواصل مع المعلم', call: 'اتصال', whatsapp: 'راسل عبر واتساب', email: 'بريد إلكتروني', city: 'المدينة', languages: 'لغات التدريس', qualificationsDisclosure: 'قدّم المعلم هذه المعلومات، ولا تتحقق درسك من المؤهلات.', mode: { online: 'عن بُعد', in_person: 'حضوري', both: 'عن بُعد وحضوري' } },
} as const;

function entryYears(entry: { start_year: number | null; end_year: number | null; current: boolean }, locale: 'en' | 'ar') {
  const years = [entry.start_year, entry.current ? (locale === 'ar' ? 'حتى الآن' : 'Present') : entry.end_year].filter(value => value !== null);
  return years.length ? years.join(' – ') : null;
}

export function TeacherProfile({ view, locale, backLabel }: { view: TeacherVisitorView; locale: string; backLabel: string }) {
  const lang = locale === 'ar' ? 'ar' : 'en';
  const ar = lang === 'ar';
  const labels = visitorLabels[lang];
  const details = view.details;
  const palette: keyof typeof paletteClasses = details?.palette && Object.hasOwn(paletteClasses, details.palette) ? details.palette : 'teal';
  const theme = paletteClasses[palette];
  const layout = details?.layout === 'compact' ? 'max-w-5xl p-4 md:p-6' : 'max-w-4xl p-5 md:p-9';
  const contactLinks = publicTeacherContactLinks(view.contacts ?? {});
  const hasContact = !!(contactLinks.phone || contactLinks.whatsapp || contactLinks.email);
  const city = details ? localizedProfileText(details.city, lang) : '';

  return <div className="min-h-[70vh] bg-cream" dir={ar ? 'rtl' : 'ltr'}>
    <section className="container py-10 md:py-16">
      <Link href={`/${locale}/teachers`} className="mb-7 inline-flex font-bold text-orange">{backLabel}</Link>
      <article className={`mx-auto overflow-hidden [overflow-wrap:anywhere] [word-break:normal] rounded-[1.4rem] border border-line bg-surface shadow-[0_12px_35px_rgba(6,59,59,.05)] ${layout}`}>
        {view.coverUrl && <div className="h-36 bg-cover bg-center sm:h-52" role="img" aria-label={ar ? 'غلاف ملف المعلم' : 'Teacher profile cover'} style={{ backgroundImage: `url("${view.coverUrl}")` }} />}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <TeacherAvatarImage src={view.avatarUrl} name={view.teacher.full_name} size="size-32"/>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">{ar ? 'ملف المعلم' : 'Teacher profile'}</p>
            <h1 className={`mt-2 break-words text-3xl font-black tracking-tight md:text-4xl ${theme.accent}`}>{view.teacher.full_name}</h1>
            {view.teacher.headline && <p className="mt-2 text-lg text-muted">{view.teacher.headline}</p>}
            {(city || details?.teaching_mode) && <p className="mt-2 text-sm text-muted">{[city && `${labels.city}: ${city}`, details?.teaching_mode && labels.mode[details.teaching_mode]].filter(Boolean).join(' · ')}</p>}
            {details?.languages.length ? <p className="mt-1 text-sm text-muted">{labels.languages}: {details.languages.join(ar ? '، ' : ', ')}</p> : null}
          </div>
        </div>

        {details?.sections.map(section => {
          const title = sectionTitles[lang][section.id];
          return <section key={section.id} className={`mt-8 border-t pt-7 ${theme.border}`}>
            <h2 className={`text-xl font-black ${theme.accent}`}>{title}</h2>
            {section.id === 'qualifications' && <p className="mt-2 text-sm leading-6 text-muted">{labels.qualificationsDisclosure}</p>}
            {Array.isArray(section.value) ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.value.map(entry => {
                const entryTitle = localizedProfileText(entry.title, lang);
                const organization = localizedProfileText(entry.organization, lang);
                const description = localizedProfileText(entry.description, lang);
                const years = entryYears(entry, lang);
                return <li key={entry.id} className={`min-w-0 rounded-xl p-4 ${theme.surface}`}>
                  {entryTitle && <h3 className={`font-bold ${theme.accent}`}>{entryTitle}</h3>}
                  {organization && <p className="mt-1 text-sm font-medium text-ink-soft">{organization}</p>}
                  {years && <p className="mt-1 text-xs text-muted">{years}</p>}
                  {description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{description}</p>}
                </li>;
              })}
            </ul> : <p className="mt-3 whitespace-pre-wrap leading-8 text-ink-soft">{localizedProfileText(section.value, lang)}</p>}
          </section>;
        })}

        <section className={`mt-8 border-t pt-7 ${theme.border}`}>
          <h2 className={`text-xl font-black ${theme.accent}`}>{labels.subjects}</h2>
          {view.specializations.length ? <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
            {view.specializations.map(item => <li key={item.id} className={`min-w-0 rounded-xl p-4 ${theme.surface}`}>
              <span className={`block font-bold ${theme.accent}`}>{item.subject}</span>
              {item.context && <span className="mt-1 block text-sm text-muted">{item.context}</span>}
            </li>)}
          </ul> : <p className="mt-3 text-muted">{labels.noSubjects}</p>}
        </section>

        <section className={`mt-8 border-t pt-7 ${theme.border}`}>
          <h2 className={`text-xl font-black ${theme.accent}`}>{labels.groups}</h2>
          {view.groups.length ? <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">{view.groups.map(group => <div key={group.id} className="min-w-0"><GroupCard group={group} locale={locale} t={{ groups: labels.groups, findTutor: labels.findTutor }} modeLabel={details?.teaching_mode === 'online' ? labels.mode.online : undefined} /></div>)}</div> : <p className="mt-3 text-muted">{labels.noGroups}</p>}
        </section>

        {hasContact && <section className={`mt-8 border-t pt-7 ${theme.border}`}>
          <h2 className={`text-xl font-black ${theme.accent}`}>{labels.contact}</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {contactLinks.phone && <a href={contactLinks.phone} dir="ltr" className={`rounded-xl border px-4 py-2.5 font-bold ${theme.border} ${theme.accent}`}>{labels.call}</a>}
            {contactLinks.whatsapp && <a href={contactLinks.whatsapp} target="_blank" rel="noopener noreferrer" dir="ltr" className={`rounded-xl border px-4 py-2.5 font-bold ${theme.border} ${theme.accent}`}>{labels.whatsapp}</a>}
            {contactLinks.email && <a href={contactLinks.email} dir="ltr" className={`rounded-xl border px-4 py-2.5 font-bold ${theme.border} ${theme.accent}`}>{labels.email}</a>}
          </div>
        </section>}
      </article>
    </section>
  </div>;
}
