import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { studentBookingData } from '@/features/bookings/data';
import { BookingList, SlotList } from '@/features/bookings/views';
import { StudentBookingProposalForm } from '@/features/bookings/forms';

export default async function StudentBookings({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    requests_page?: string;
    available_page?: string;
    proposal_group_q?: string;
  }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const data = await studentBookingData(
    locale,
    query.requests_page,
    query.available_page,
    query.proposal_group_q,
  );
  const now = new Date().toISOString();
  const labels = ar
    ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
    : { previous: 'Previous', next: 'Next', page: 'Page' };
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'المواعيد الفردية' : 'One-off appointments'}
        title={ar ? 'الحجوزات' : 'Bookings'}
        description={
          ar
            ? 'اختر موعدًا نشره المعلم أو اقترح موعدًا آخر؛ يؤكد المعلم كل موعد. تبقى المواعيد الفردية منفصلة عن حصص المجموعة المعتادة.'
            : 'Choose a teacher’s published time or suggest another time. Your teacher confirms each appointment. These stay separate from regular group lessons.'
        }
      />
      {data.error && (
        <Panel className="mb-5">
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذر تحميل الحجوزات. حدّث الصفحة وحاول مرة أخرى.'
              : 'Could not load bookings. Refresh and try again.'}
          </p>
        </Panel>
      )}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-teal">
              {ar ? 'اختر موعدًا منشورًا' : 'Choose a published time'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {ar
                ? 'اختر من الأوقات التي نشرها معلمو مجموعاتك المقبولة.'
                : 'Choose from times published by teachers of your accepted groups.'}
            </p>
          </div>
          <Link href={`/${locale}/timetable`} className="font-semibold text-orange underline">
            {ar ? 'الجدول الدراسي للحصص' : 'Regular lesson timetable'}
          </Link>
        </div>
        <SlotList
          locale={locale}
          rows={data.slots}
          now={now}
          empty={
            ar ? 'لا توجد أوقات فردية متاحة الآن.' : 'No one-off times are available right now.'
          }
        />
        <StudentPagination
          locale={locale}
          href={`/${locale}/student/bookings`}
          pageParam="available_page"
          page={data.availablePage}
          pageCount={data.availablePageCount}
          labels={labels}
          preserve={{ requests_page: data.requestPage }}
        />
      </section>
      <section className="mb-8">
        <div className="mb-3">
          <h2 className="text-xl font-black text-teal">
            {ar ? 'اقترح موعدًا آخر' : 'Suggest another time'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {ar
              ? 'اقترح وقتًا خاصًا لمعلم إحدى مجموعاتك المقبولة.'
              : 'Suggest a private time to the teacher of one of your accepted groups.'}
          </p>
        </div>
        <Panel>
          <StudentBookingProposalForm
            locale={locale}
            groups={data.proposalGroups}
            query={data.proposalGroupQuery}
          />
        </Panel>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-teal">
              {ar ? 'طلباتي ومواعيدي الفردية' : 'My booking requests and appointments'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {ar
                ? 'الحجز لا يسجل حضورًا في حصص المجموعة.'
                : 'A booking does not create attendance in a group lesson.'}
            </p>
          </div>
          <Link href={`/${locale}/timetable`} className="font-semibold text-orange underline">
            {ar ? 'عرض حصص المجموعة' : 'View group lessons'}
          </Link>
        </div>
        <BookingList
          locale={locale}
          rows={data.requests}
          now={now}
          empty={ar ? 'لم تطلب موعدًا فرديًا بعد.' : 'You have not requested a one-off time yet.'}
        />
        <StudentPagination
          locale={locale}
          href={`/${locale}/student/bookings`}
          pageParam="requests_page"
          page={data.requestPage}
          pageCount={data.requestPageCount}
          labels={labels}
          preserve={{ available_page: data.availablePage }}
        />
      </section>
    </>
  );
}
