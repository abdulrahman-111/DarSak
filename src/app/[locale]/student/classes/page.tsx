import Link from 'next/link';
import { ArrowUpRight, BookOpen, Clock3 } from 'lucide-react';
import { ensureLocale } from '@/i18n/config';
import { studentClasses } from '@/features/student/data';
import { EnrollmentForm } from '@/features/student/forms';
import { Status } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import {
  ClassMark,
  StudentEmpty,
  StudentHeading,
  studentCard,
} from '@/features/student/workspace-ui';
export default async function StudentClasses({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; cancelled?: string }>;
}) {
  const { locale: raw } = await params,
    locale = ensureLocale(raw),
    ar = locale === 'ar',
    search = await searchParams,
    data = await studentClasses(locale, search?.page);
  const accepted = data.enrollments.filter(e => e.status === 'accepted'),
    requests = data.enrollments.filter(e => e.status !== 'accepted');
  const labels = ar
    ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
    : { previous: 'Previous', next: 'Next', page: 'Page' };
  return (
    <div className="screen-enter">
      <StudentHeading
        eyebrow={ar ? 'مساحتك التعليمية' : 'Your learning space'}
        title={ar ? 'مجموعاتي' : 'My classes'}
        description={
          ar
            ? 'ادخل إلى مجموعتك لمتابعة الحصص والمواد والتواصل مع معلمك.'
            : 'Open a class to find your lessons, materials and teacher contact in one place.'
        }
        action={
          <Link
            href={`/${locale}/teachers`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-bold text-teal transition-colors hover:border-teal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            {ar ? 'اكتشف مجموعة' : 'Find a class'}
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      {search?.cancelled === '1' && (
        <p role="status" className="mb-5 rounded-xl bg-teal/5 p-4 text-sm text-teal">
          {ar
            ? 'تم إلغاء التسجيل. يمكنك طلب الانضمام مجددًا لاحقًا.'
            : 'Enrollment cancelled. You can request to join again later.'}
        </p>
      )}
      {data.error ? (
        <section className={studentCard}>
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذر تحميل مجموعاتك. حدّث الصفحة للمحاولة مجددًا.'
              : 'Could not load your classes. Refresh to try again.'}
          </p>
        </section>
      ) : (
        <>
          {!!accepted.length && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 font-bold text-teal">
                <BookOpen size={18} />
                {ar ? 'مجموعاتك المسجل بها' : 'Your enrolled classes'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {accepted.map(e => (
                  <Link
                    key={e.id}
                    href={`/${locale}/student/classes/${e.group_id}`}
                    className={`${studentCard} group transition-colors hover:border-teal/40 focus-visible:ring-2 focus-visible:ring-teal`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <ClassMark name={e.group?.name ?? 'D'} />
                      <Status
                        value={e.group?.status === 'archived' ? 'archived' : 'accepted'}
                        locale={locale}
                      />
                    </div>
                    <h3 className="mt-4 break-words text-lg font-bold text-teal">
                      {e.group?.name || (ar ? 'مجموعتك التعليمية' : 'Your learning class')}
                    </h3>
                    {e.group?.location && (
                      <p className="mt-2 text-sm text-muted">{e.group.location}</p>
                    )}
                    <p className="mt-5 flex items-center gap-2 text-sm font-bold text-teal">
                      {ar ? 'دخول المجموعة' : 'Open class'}
                      <ArrowUpRight
                        size={16}
                        aria-hidden="true"
                        className="transition-transform motion-safe:group-hover:-translate-y-0.5"
                      />
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {!!requests.length && (
            <section className={accepted.length ? 'mt-8' : ''}>
              <h2 className="mb-4 flex items-center gap-2 font-bold text-teal">
                <Clock3 size={18} />
                {ar ? 'طلبات الانضمام' : 'Enrollment requests'}
              </h2>
              <div className="grid gap-3">
                {requests.map(e => (
                  <article key={e.id} className={studentCard}>
                    <div className="flex items-center gap-3">
                      <ClassMark name={e.group?.name ?? 'D'} />
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-bold text-teal">
                          {e.group?.name ||
                            (ar ? 'طلب انضمام لمجموعة' : 'Class enrollment request')}
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                          {e.status === 'pending'
                            ? ar
                              ? 'سيراجع معلمك طلبك. تتاح الحصص وبيانات التواصل بعد القبول.'
                              : 'Your teacher will review your request. Lessons and contact details unlock after acceptance.'
                            : ar
                              ? 'يمكنك متابعة القرار هنا.'
                              : 'Your enrollment decision is shown here.'}
                        </p>
                      </div>
                      <Status value={e.status} locale={locale} />
                    </div>
                    {e.status === 'pending' && (
                      <details className="mt-3 border-t border-line pt-2">
                        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted">
                          {ar ? 'إدارة الطلب' : 'Manage request'}
                        </summary>
                        <EnrollmentForm locale={locale} id={e.id} kind="cancel" />
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {!data.enrollments.length && (
            <StudentEmpty
              title={ar ? 'ابدأ بمجموعتك الأولى' : 'Find your first learning group'}
              description={
                ar
                  ? 'اختر مادة ومعلمًا يناسبان أهدافك، ثم أرسل طلب الانضمام.'
                  : 'Choose a subject and teacher that fit your goals, then request to join.'
              }
              href={`/${locale}/teachers`}
              label={ar ? 'اكتشف المعلمين والمجموعات' : 'Explore teachers and groups'}
              icon="find-a-group"
            />
          )}
          <StudentPagination
            locale={locale}
            href={`/${locale}/student/classes`}
            page={data.page}
            pageCount={data.pageCount}
            labels={labels}
          />
        </>
      )}
    </div>
  );
}
