import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { studentBookingData } from '@/features/bookings/data';
import { BookingList, SlotList } from '@/features/bookings/views';

export default async function StudentBookings({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ requests_page?: string; available_page?: string }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const data = await studentBookingData(locale, query.requests_page, query.available_page);
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
            ? 'اطلب موعدًا فرديًا من الأوقات المتاحة لمجموعاتك. تبقى هذه المواعيد منفصلة عن حصص المجموعة المعتادة.'
            : 'Request a one-off appointment from times offered for your groups. These stay separate from regular group lessons.'
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
              {ar ? 'أوقات متاحة' : 'Available one-off times'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {ar
                ? 'تظهر فقط أوقات مجموعاتك التي قُبلت فيها.'
                : 'Only times for groups that accepted your enrollment appear here.'}
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
