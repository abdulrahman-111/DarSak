import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { lessonDetail } from '@/features/student/data';
import { DownloadForm } from '@/features/student/forms';
import { EmptyState, Panel, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import { safeLink } from '@/features/student/domain';
import { Suspense } from 'react';
import { AnnouncementView } from '@/features/groups/announcement-view';
import { StudentAttendanceStatus } from '@/features/student/attendance-status';

export default async function StudentLesson({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const data = await lessonDetail(locale, id);
  if (!data) notFound();
  return (
    <>
      <Link
        href={`/${locale}/student/classes/${data.lesson.group_id}?view=lessons`}
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-teal underline"
      >
        {ar ? 'العودة إلى حصص المجموعة' : 'Back to class lessons'}
      </Link>
      <ScreenTitle
        eyebrow={ar ? 'تفاصيل الحصة' : 'Lesson details'}
        title={data.lesson.title}
        description={cairoDate(data.lesson.starts_at, locale)}
        action={<Status value={data.lesson.status} locale={locale} />}
      />
      <AnnouncementView locale={locale} announcement={data.announcement} className="mb-6" />
      <Suspense
        fallback={
          <Panel className="mb-6">
            <div aria-hidden="true" className="h-5 w-24 animate-pulse rounded bg-line/70" />
            <div
              aria-hidden="true"
              className="mt-3 h-4 w-56 max-w-full animate-pulse rounded bg-line/70"
            />
          </Panel>
        }
      >
        <StudentAttendanceStatus db={data.db} locale={locale} lessonId={id} />
      </Suspense>
      {data.lesson.notes && (
        <Panel className="mb-6">
          <h2 className="font-black text-teal">{ar ? 'ملاحظات الحصة' : 'Lesson notes'}</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-muted [overflow-wrap:anywhere]">
            {data.lesson.notes}
          </p>
        </Panel>
      )}
      {data.error ? (
        <Panel>
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذّر تحميل موارد الحصة. حدّث الصفحة وحاول مرة أخرى.'
              : 'Could not load lesson resources. Refresh and try again.'}
          </p>
          <Link
            href={`/${locale}/student/lessons/${id}?retry=1`}
            className="mt-3 inline-flex font-bold text-orange underline"
          >
            {ar ? 'إعادة المحاولة' : 'Try again'}
          </Link>
        </Panel>
      ) : (
        <Panel>
          <h2 className="mb-4 text-xl font-black text-teal">
            {ar ? 'المواد التعليمية' : 'Learning resources'}
          </h2>
          {data.materials.length ? (
            <div className="grid gap-3">
              {data.materials.map(material => (
                <div key={material.id} className="min-w-0 rounded-2xl border border-line p-4">
                  <strong className="break-words text-teal [overflow-wrap:anywhere]">
                    {material.title}
                  </strong>
                  {material.kind === 'note' && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted [overflow-wrap:anywhere]">
                      {material.content}
                    </p>
                  )}
                  {material.kind === 'link' && safeLink(material.url) && (
                    <p className="mt-3">
                      <Link
                        href={safeLink(material.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center break-all font-bold text-orange underline"
                      >
                        {ar ? 'فتح الرابط' : 'Open resource'}
                      </Link>
                    </p>
                  )}
                  {material.kind === 'file' && <DownloadForm locale={locale} id={material.id} />}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>
              {ar
                ? 'لم يشارك المعلم موارد لهذه الحصة بعد.'
                : 'Your teacher has not shared lesson resources yet.'}
            </EmptyState>
          )}
        </Panel>
      )}
    </>
  );
}
