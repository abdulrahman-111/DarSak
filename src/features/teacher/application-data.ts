import 'server-only';
import type { Locale } from '@/features/student/domain';
import type { PlatformViewer } from '@/components/platform/access';
import { parseTeacherApplicationReadResponse, type TeacherApplicationReadResponse } from './application-domain';

export async function teacherApplication(viewer: PlatformViewer): Promise<TeacherApplicationReadResponse & { error: string | null; cvUrl: string | null }> {
  const { data, error } = await viewer.db.rpc('read_teacher_application', { p_teacher_id: viewer.id });
  if (error) return { application: null, missing: [], error: 'unavailable', cvUrl: null };
  const response = parseTeacherApplicationReadResponse(data);
  if (!response.application) return { ...response, error: 'unavailable', cvUrl: null };
  const signed = response.application.cv_path
    ? await viewer.db.storage.from('teacher-applications').createSignedUrl(response.application.cv_path, 60, { download: true })
    : null;
  return { ...response, error: signed?.error ? 'download' : null, cvUrl: signed?.data?.signedUrl ?? null };
}

export function applicationMissingLabel(locale: Locale, code: string): string {
  const ar = locale === 'ar';
  const labels: Record<string, [string, string]> = {
    full_name: ['Full name', 'الاسم الكامل'], photo: ['Profile photo', 'الصورة الشخصية'], headline: ['Profile headline', 'العنوان المهني'],
    bio: ['Public biography (at least 80 characters)', 'النبذة العامة (80 حرفاً على الأقل)'], specializations: ['At least one subject and level', 'مادة ومرحلة واحدة على الأقل'],
    languages: ['At least one language', 'لغة واحدة على الأقل'], experience: ['A complete experience entry', 'خبرة مكتملة واحدة'],
    qualifications: ['A complete qualification entry', 'مؤهل مكتمل واحد'], approach: ['Teaching approach (at least 40 characters)', 'منهجية التدريس (40 حرفاً على الأقل)'],
    teaching_years: ['Years of teaching (0 is allowed)', 'سنوات التدريس (يمكن اختيار 0)'], admin_phone: ['Administrator contact phone', 'هاتف التواصل مع الإدارة'], cv: ['PDF CV', 'السيرة الذاتية بصيغة PDF'], attestation: ['Truth attestation', 'الإقرار بصحة المعلومات'],
  };
  const [enText, arText] = labels[code] ?? [code, code];
  return ar ? arText : enText;
}
