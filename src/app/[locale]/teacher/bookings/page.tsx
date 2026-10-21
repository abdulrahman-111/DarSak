import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { teacherViewer } from '@/features/teacher/data';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { teacherBookingData } from '@/features/bookings/data';
import { BookingList, SlotList } from '@/features/bookings/views';
import { PublishBookingSlotForm } from '@/features/bookings/forms';

export default async function TeacherBookings({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ requests_page?: string; slots_page?: string }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const viewer = await teacherViewer(locale);
  if (viewer.teacherError || !viewer.teacher?.approved) redirect(`/${locale}/account/application`);
  const access = await readTeacherAccessStatus(viewer.db);
  const hasTeachingAccess = !access.error && !!access.status?.has_access;
  const data = await teacherBookingData(locale, query.requests_page, query.slots_page);
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
            ? 'هذه مواعيد فردية بطلب منفصل، وتبقى منفصلة عن حصص المجموعة المعتادة.'
            : 'These are separately requested one-off appointments, distinct from your group’s regular lessons.'
        }
      />
      <Panel className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-teal">
          {ar ? 'نشر وقت متاح' : 'Publish an available time'}
        </h2>
        <p className="mb-4 text-sm text-muted">
          {ar
            ? 'اختر مجموعة منشورة تملكها. الأوقات بتوقيت القاهرة.'
            : 'Choose a published group you own. Times use Cairo time.'}
        </p>
        {data.error && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {ar ? 'تعذر تحميل الحجوزات أو المجموعات.' : 'Could not load bookings or groups.'}
          </p>
        )}
        {hasTeachingAccess ? (
          <PublishBookingSlotForm locale={locale} groups={data.groups} />
        ) : (
          <p className="text-sm text-muted">
            {ar
              ? 'انتهت صلاحية التدريس أو تعذر التحقق منها. يمكنك مراجعة الحجوزات وإلغاء الأوقات المنشورة، لكن نشر أوقات جديدة أو قبول الطلبات يتطلب صلاحية تدريس نشطة.'
              : 'Teaching access has expired or could not be verified. You can review bookings and cancel published times; publishing new times or accepting requests requires active teaching access.'}
          </p>
        )}
      </Panel>
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-teal">
              {ar ? 'الأوقات المنشورة' : 'Published one-off times'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {ar
                ? 'يمكن للطلاب المقبولين في المجموعة طلب وقت غير محجوز.'
                : 'Students accepted into the group can request an unbooked time.'}
            </p>
          </div>
          <Link href={`/${locale}/teacher/lessons`} className="font-semibold text-orange underline">
            {ar ? 'تقويم الحصص المعتادة' : 'Regular lesson calendar'}
          </Link>
        </div>
        <SlotList
          locale={locale}
          rows={data.slots}
          now={now}
          teacher
          empty={ar ? 'لا توجد أوقات منشورة.' : 'No times have been published.'}
        />
        <StudentPagination
          locale={locale}
          href={`/${locale}/teacher/bookings`}
          pageParam="slots_page"
          page={data.slotPage}
          pageCount={data.slotPageCount}
          labels={labels}
          preserve={{ requests_page: data.requestPage }}
        />
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-teal">
              {ar ? 'طلبات ومواعيد الحجوزات' : 'Booking requests and appointments'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {ar
                ? 'اقبل الطلبات أو ارفضها. قبول طلب يحجز الموعد للطالب.'
                : 'Accept or decline requests. Accepting reserves the time for that student.'}
            </p>
          </div>
          <Link href={`/${locale}/teacher/lessons`} className="font-semibold text-orange underline">
            {ar ? 'الحصص المعتادة' : 'Regular group lessons'}
          </Link>
        </div>
        <BookingList
          locale={locale}
          rows={data.requests}
          now={now}
          allowDecision={hasTeachingAccess}
          teacher
          empty={ar ? 'لا توجد طلبات حجوزات.' : 'No booking requests yet.'}
        />
        <StudentPagination
          locale={locale}
          href={`/${locale}/teacher/bookings`}
          pageParam="requests_page"
          page={data.requestPage}
          pageCount={data.requestPageCount}
          labels={labels}
          preserve={{ slots_page: data.slotPage }}
        />
      </section>
    </>
  );
}
