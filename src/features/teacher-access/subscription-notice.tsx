import Link from 'next/link';

export function teacherSubscriptionNoticeCopy(locale: string) {
  return locale === 'ar'
    ? {
        title: 'اشتراكات المعلمين',
        free: 'المنصة مجانية حتى الفصل الدراسي القادم. سنعلن عن الخطط المدفوعة قبل بدء تطبيقها.',
        details: 'لا توجد رسوم اشتراك خلال الفترة المجانية.',
        compactLink: 'إدارة الخطة',
        support:
          'سيتواصل معك فريق الدعم لاستكمال التسجيل وشرح خيارات الخطط قبل بدء الاشتراكات المدفوعة.',
      }
    : {
        title: 'Teacher subscriptions',
        free: 'The platform is free until next semester. We will announce paid plans before they begin.',
        details: 'There are no subscription fees during the free launch.',
        compactLink: 'Manage plan',
        support:
          'Our support team will contact you to complete registration and explain the plan options before paid subscriptions begin.',
      };
}

export function TeacherSubscriptionNotice({
  locale,
  signedInTeacher = false,
  compact = false,
}: {
  locale: string;
  signedInTeacher?: boolean;
  compact?: boolean;
}) {
  const copy = teacherSubscriptionNoticeCopy(locale);
  if (compact)
    return (
      <aside
        aria-label={copy.title}
        className="mb-3 flex flex-wrap items-center gap-x-2 text-sm leading-5 text-muted"
      >
        <span>{copy.free}</span>
        <Link
          className="inline-flex min-h-11 items-center font-bold text-teal underline underline-offset-2"
          href={`/${locale}/account/teaching-access`}
        >
          {copy.compactLink}
        </Link>
      </aside>
    );
  return (
    <aside
      aria-label={copy.title}
      className="mb-4 min-w-0 rounded-2xl border border-line-strong bg-surface p-4 text-sm leading-6 text-ink-soft sm:flex sm:flex-wrap sm:items-start sm:gap-4"
    >
      <span className="mb-3 inline-flex max-w-full shrink-0 whitespace-normal rounded-full bg-[#e0eeec] px-3 py-1 text-xs font-black text-teal sm:mb-0">
        {copy.free}
      </span>
      <div className="min-w-0 wrap-break-word [overflow-wrap:anywhere]">
        <h2 className="font-black text-teal">{copy.title}</h2>
        <p className="mt-1">{copy.details}</p>
        {signedInTeacher && (
          <p className="mt-2 rounded-xl bg-[#e0eeec] p-3 font-semibold text-[#0e3b3c]" role="note">
            {copy.support}
          </p>
        )}
      </div>
    </aside>
  );
}
