import type { SupabaseClient } from '@supabase/supabase-js';
import { Panel } from '@/components/platform/ui';
import type { Locale } from './domain';
import type { AttendanceStatus } from '../teacher/attendance-data';

const labels: Record<Locale, Record<AttendanceStatus, string>> = {
  en: { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' },
  ar: { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'معذور' },
};

export async function StudentAttendanceStatus({
  db,
  locale,
  lessonId,
}: {
  db: SupabaseClient;
  locale: Locale;
  lessonId: string;
}) {
  const ar = locale === 'ar';
  const result = await db
    .from('lesson_attendance')
    .select('status,recorded_at')
    .eq('lesson_id', lessonId)
    .maybeSingle();
  return (
    <Panel className="mb-6">
      <h2 className="font-black text-teal">{ar ? 'حضورك' : 'Your attendance'}</h2>
      {result.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {ar ? 'تعذر تحميل حالة الحضور.' : 'Could not load your attendance status.'}
        </p>
      ) : (
        <>
          <p className="mt-2 text-muted">
            {result.data
              ? labels[locale][result.data.status as AttendanceStatus]
              : ar
                ? 'لم تُسجل حالة حضور لهذه الحصة.'
                : 'No attendance has been recorded for this lesson.'}
          </p>
          {result.data?.recorded_at && (
            <p className="mt-1 text-xs text-muted">
              {new Intl.DateTimeFormat(ar ? 'ar' : 'en', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Cairo',
              }).format(new Date(result.data.recorded_at))}
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
