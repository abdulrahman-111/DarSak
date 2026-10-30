import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, BookOpen, CalendarDays, GraduationCap, MapPin, Users } from 'lucide-react';
import { publicCopy } from '@/components/public/copy';
import type { Group } from '@/lib/supabase/types';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';
export function SetupCard({ t }: { t: Record<string, string> }) {
  return (
    <div className="rounded-3xl border border-orange/30 bg-orange/10 p-6">
      <h2 className="text-xl font-bold">{t.setupTitle}</h2>
      <p className="mt-2 wrap-break-word text-muted [overflow-wrap:anywhere]">{t.setupText}</p>
      <code className="mt-4 block rounded-xl bg-white/70 p-3 text-sm">.env.local</code>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8">
      <p className="mb-2 text-sm font-bold uppercase tracking-[.18em] text-orange">{eyebrow}</p>
      <h1 className="text-3xl font-black tracking-tight text-teal md:text-5xl">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-muted">{description}</p>}
    </div>
  );
}
export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-line bg-white p-5 shadow-[0_12px_35px_rgba(6,59,59,.06)] ${className}`}
    >
      {children}
    </div>
  );
}
export function GroupCard({
  group,
  locale,
  t,
  modeLabel,
}: {
  group: Group;
  locale: string;
  t: Record<string, string>;
  modeLabel?: string;
}) {
  const lang = locale === 'ar' ? 'ar' : 'en';
  const c = publicCopy[lang];
  const subject = group.offering?.subject ? catalogueDisplayName(group.offering.subject, lang) : '';
  const context = group.offering?.node ? catalogueDisplayName(group.offering.node, lang) : '';
  const nextLesson = group.next_lesson_at
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }).format(new Date(group.next_lesson_at))
    : null;
  const seats = group.available_seats;
  // Teachers often name a group after its subject; repeating it as a tag above the identical title is noise.
  const showSubject =
    !!subject && subject.trim().toLocaleLowerCase() !== group.name.trim().toLocaleLowerCase();
  const full = seats === 0;
  return (
    <article className="group relative flex h-full flex-col rounded-[1.15rem] border border-line bg-surface p-5 transition duration-200 hover:-translate-y-1 hover:border-[#cdbfa6] hover:shadow-[0_18px_36px_-24px_rgba(14,74,75,.55)]">
      <div className="flex min-w-0 items-center justify-between gap-3">
        {showSubject ? (
          <span
            title={subject}
            className="min-w-0 truncate rounded-lg bg-mint px-2.5 py-1 text-xs font-bold text-teal"
          >
            {subject}
          </span>
        ) : (
          <span />
        )}
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${full ? 'bg-[#eee7da] text-ink-soft' : 'bg-success-soft text-success'}`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${full ? 'bg-muted' : 'bg-success'}`}
          />
          {full ? c.noSeats : c.published}
        </span>
      </div>
      <h3 className="mt-4 wrap-break-word text-xl font-bold leading-tight text-teal [overflow-wrap:anywhere]">
        {group.name}
      </h3>
      {group.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-soft">{group.description}</p>
      )}
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-[#efe6d6] pt-4 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <MapPin size={15} />
          {group.location || c.unknownLocation}
        </span>
        <span className="flex items-center gap-1.5">
          <Image
            aria-hidden="true"
            src="/brand/darsak/available-seats.svg"
            alt=""
            width={16}
            height={16}
          />
          {c.availableSeats}: {seats ?? group.capacity}
        </span>
        {context && (
          <span className="flex items-center gap-1.5">
            <Image
              aria-hidden="true"
              src="/brand/darsak/academic-stage.svg"
              alt=""
              width={16}
              height={16}
            />
            {c.context}: {context}
          </span>
        )}
        {modeLabel && (
          <span className="flex items-center gap-1.5">
            <Image
              aria-hidden="true"
              src="/brand/darsak/group-discovery-metadata-badges-online-mode.svg"
              alt=""
              width={16}
              height={16}
            />
            {modeLabel}
          </span>
        )}
        <span className="flex w-full items-center gap-1.5">
          <Image
            aria-hidden="true"
            src="/brand/darsak/next-session-time.svg"
            alt=""
            width={16}
            height={16}
          />
          {c.nextLesson}: {nextLesson || c.noNextLesson}
        </span>
      </div>
      {group.teacher && (
        <Link
          className="relative z-10 mt-3 self-start text-sm font-bold text-teal underline decoration-teal/30 underline-offset-2"
          href={`/${locale}/teachers/${group.teacher.id}`}
        >
          {c.teacher}: {group.teacher.full_name}
        </Link>
      )}
      <Link
        className="mt-5 inline-flex items-center gap-1.5 self-start font-bold text-orange after:absolute after:inset-0"
        href={`/${locale}/groups/${group.id}`}
        aria-label={`${c.openGroup}: ${group.name}`}
      >
        <span className="relative">{c.openGroup}</span>
        <ArrowUpRight className={lang === 'ar' ? 'rotate-[-90deg]' : ''} size={16} />
      </Link>
    </article>
  );
}
export function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="flex items-center gap-4">
      <span className="rounded-2xl bg-orange/10 p-3 text-orange">
        <Icon size={22} />
      </span>
      <div>
        <p className="text-2xl font-black text-teal">{value}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </Card>
  );
}
export const icons = { BookOpen, CalendarDays, GraduationCap, Users };
