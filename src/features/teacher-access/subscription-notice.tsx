export function teacherSubscriptionNoticeCopy(locale: string) {
  return locale === 'ar'
    ? {
        title: 'اشتراكات المعلمين',
        free: 'الشهر الأول مجاني بالكامل.',
        plans: 'بعد ذلك، ستتوفر اشتراكات شهرية وفصلية.',
        details: 'سنعلن الأسعار ومدة الفصل الدراسي وتفاصيل الدفع قبل تفعيل أي اشتراك مدفوع.',
      }
    : {
        title: 'Teacher subscriptions',
        free: 'Your first month is completely free.',
        plans: 'After that, monthly and semester subscriptions will be available.',
        details: 'We’ll announce prices, semester length, and payment details before any paid subscription is activated.',
      };
}

export function TeacherSubscriptionNotice({ locale }: { locale: string }) {
  const copy = teacherSubscriptionNoticeCopy(locale);
  return <aside aria-label={copy.title} className="mb-4 min-w-0 rounded-2xl border border-[#d8ccb8] bg-[#fffdf8] p-4 text-sm leading-6 text-[#4d473f] sm:flex sm:items-start sm:gap-4">
    <span className="mb-3 inline-flex shrink-0 rounded-full bg-[#e0eeec] px-3 py-1 text-xs font-black text-teal sm:mb-0">{copy.free}</span>
    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
      <h2 className="font-black text-teal">{copy.title}</h2>
      <p className="mt-1">{copy.plans} {copy.details}</p>
    </div>
  </aside>;
}
