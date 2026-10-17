import Link from 'next/link';
import { TEACHER_PLANS } from '@/features/subscriptions/plans';

export function teacherSubscriptionNoticeCopy(locale: string) {
  return locale === 'ar'
    ? {
        title: 'اشتراكات المعلمين',
        free: 'تستمر الفترة المجانية حتى نهاية يوم ١٤ نوفمبر ٢٠٢٦.',
        plans: `الخطط القادمة: ستاندرد ${TEACHER_PLANS.standard.monthlyEgp} جنيه شهرياً وبرو ${TEACHER_PLANS.pro.monthlyEgp} جنيه شهرياً.`,
        details: 'أقرب موعد لبدء الخطط المدفوعة هو ١٥ نوفمبر ٢٠٢٦. الخطط غير مفعلة حالياً ولا يوجد تحصيل أو تفعيل اشتراك الآن.',
        link: 'عرض تفاصيل الخطط',
        support: 'سيتواصل معك أحد أعضاء فريق الدعم لاستكمال التسجيل. وعند بدء الخطط المدفوعة، سينسق معك مباشرةً رسوم الاشتراك. لا يتم الدفع عبر هذا الموقع.',
      }
    : {
        title: 'Teacher subscriptions',
        free: 'The free launch runs through 14 November 2026.',
        plans: `Upcoming plans: Standard at EGP ${TEACHER_PLANS.standard.monthlyEgp}/month and Pro at EGP ${TEACHER_PLANS.pro.monthlyEgp}/month.`,
        details: 'The earliest paid-plan start is 15 November 2026. Plans are not active now; no payment will be collected and no subscription will be activated now.',
        link: 'View plan details',
        support: 'A member of support will contact you to complete registration. When paid plans begin, they will arrange subscription fees with you directly. There is no payment through this website.',
      };
}

export function TeacherSubscriptionNotice({ locale, signedInTeacher = false }: { locale: string; signedInTeacher?: boolean }) {
  const copy = teacherSubscriptionNoticeCopy(locale);
  return <aside aria-label={copy.title} className="mb-4 min-w-0 rounded-2xl border border-[#d8ccb8] bg-[#fffdf8] p-4 text-sm leading-6 text-[#4d473f] sm:flex sm:flex-wrap sm:items-start sm:gap-4">
    <span className="mb-3 inline-flex max-w-full shrink-0 whitespace-normal rounded-full bg-[#e0eeec] px-3 py-1 text-xs font-black text-teal sm:mb-0">{copy.free}</span>
    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
      <h2 className="font-black text-teal">{copy.title}</h2>
      <p className="mt-1">{copy.plans} {copy.details}</p>
      {signedInTeacher && <p className="mt-2 rounded-xl bg-[#e0eeec] p-3 font-semibold text-[#0e3b3c]" role="note">{copy.support}</p>}
      <Link className="mt-2 inline-block font-bold text-orange underline underline-offset-2" href={`/${locale}/pricing`}>{copy.link}</Link>
    </div>
  </aside>;
}
