'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';

export type AttendanceActionState = { error?: string; success?: string } | null;

export async function saveLessonAttendance(locale: Locale, lessonId: string, studentId: string, status: string | null): Promise<AttendanceActionState> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const msg = (en: string, ar: string) => locale === 'ar' ? ar : en;
  if (!user) return { error: msg('Sign in to update attendance.', 'سجل الدخول لتحديث الحضور.') };
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'teacher' || profile.status !== 'active') return { error: msg('An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  const { error } = await db.rpc('set_lesson_attendance', { p_lesson_id: lessonId, p_student_id: studentId, p_status: status });
  if (error) {
    const detail = error.message.toLowerCase();
    if (error.code === '42501' || detail.includes('not authorized')) return { error: msg('Only an approved owner can update attendance.', 'يمكن للمعلم المعتمد مالك المجموعة تحديث الحضور فقط.') };
    if (detail.includes('accepted')) return { error: msg('This student is no longer accepted in the group.', 'لم يعد هذا الطالب مقبولاً في المجموعة.') };
    if (detail.includes('future') || detail.includes('not started')) return { error: msg('Attendance is available after the lesson starts.', 'يتاح تسجيل الحضور بعد بدء الحصة.') };
    if (detail.includes('cancelled') || detail.includes('archived')) return { error: msg('Attendance cannot be changed for a cancelled lesson or archived group.', 'لا يمكن تحديث حضور حصة ملغاة أو مجموعة مؤرشفة.') };
    return { error: msg('Could not save attendance. Refresh and try again.', 'تعذر حفظ الحضور. حدّث الصفحة وحاول مرة أخرى.') };
  }
  revalidatePath(`/${locale}/teacher/lessons/${lessonId}`);
  revalidatePath(`/${locale}/student/lessons/${lessonId}`);
  return { success: msg('Attendance saved.', 'تم حفظ الحضور.') };
}
