import { Mail, MessageCircle, Phone } from 'lucide-react';
import { ClassMark } from './workspace-ui';
import type { Locale } from './domain';
import { publicTeacherContactLinks } from '@/features/teacher/profile-domain';
import { whatsappGroupMessageUrl } from './enrollment-guidance-domain';

type TeacherContacts = {
  phone_number?: string | null;
  whatsapp_number?: string | null;
  contact_email?: string | null;
} | null;

export function StudentTeacherContactCard({
  locale,
  groupName,
  teacherName,
  teacherHeadline,
  teacherAvailable,
  contacts,
  welcome = false,
}: {
  locale: Locale;
  groupName: string;
  teacherName: string;
  teacherHeadline?: string | null;
  teacherAvailable: boolean;
  contacts: TeacherContacts;
  welcome?: boolean;
}) {
  if (!teacherAvailable) return null;
  const ar = locale === 'ar';
  const links = contacts ? publicTeacherContactLinks(contacts) : null;
  const hasChannel = !!(links?.whatsapp || links?.phone || links?.email);
  return (
    <section
      id="teacher-contact"
      className={`student-contact-card ${welcome ? 'student-contact-card-welcome' : ''} rounded-2xl border border-teal/20 bg-white p-5 shadow-sm`}
      aria-labelledby="teacher-contact-title"
    >
      {welcome && (
        <p className="mb-4 rounded-xl bg-mint px-4 py-3 text-sm font-bold text-teal" role="status">
          {ar
            ? 'تم قبولك! تواصل مع المعلم لتأكيد الترتيبات'
            : "You're accepted! Contact your teacher to confirm arrangements."}
        </p>
      )}
      <div className="flex items-center gap-4">
        <ClassMark name={teacherName || 'D'} size={52} />
        <div className="min-w-0">
          <h2 id="teacher-contact-title" className="break-words text-xl font-bold text-teal">
            {teacherName}
          </h2>
          {teacherHeadline && <p className="mt-1 text-sm text-muted">{teacherHeadline}</p>}
        </div>
      </div>
      <h3 className="mt-5 font-bold text-teal">
        {ar ? 'تواصل مع معلمك لتأكيد الترتيبات' : 'Contact your teacher to confirm arrangements'}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        {ar
          ? 'تواصل لتأكيد مواعيد المجموعة وترتيباتها.'
          : 'Get in touch to confirm the class schedule and arrangements.'}
      </p>
      {hasChannel ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {links?.whatsapp && (
            <a
              href={whatsappGroupMessageUrl(links.whatsapp, groupName, locale)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-4 font-bold text-white"
            >
              <MessageCircle size={18} /> WhatsApp
            </a>
          )}
          {links?.phone && (
            <a
              href={links.phone}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line px-4 font-bold text-teal"
            >
              <Phone size={18} /> {ar ? 'اتصال' : 'Call'}
            </a>
          )}
          {links?.email && (
            <a
              href={links.email}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line px-4 font-bold text-teal"
            >
              <Mail size={18} /> {ar ? 'بريد إلكتروني' : 'Email'}
            </a>
          )}
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-cream p-4 text-sm leading-6 text-muted">
          {ar
            ? 'لم يضف المعلم بيانات تواصل متاحة بعد. تابع إعلانات المجموعة.'
            : 'Your teacher has not shared contact details yet. Check class announcements for updates.'}
        </p>
      )}
    </section>
  );
}
