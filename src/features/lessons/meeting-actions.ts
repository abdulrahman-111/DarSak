'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseMeetingUrl } from './meeting-url';

export type MeetingFormState = { ok?: true; error?: string } | null;

const localized = (locale: string, en: string, ar: string) => (locale === 'ar' ? ar : en);
const extraHosts = () =>
  (process.env.MEETING_HOSTS_EXTRA ?? '')
    .split(',')
    .map(host => host.trim())
    .filter(Boolean);

export async function saveGroupMeetingUrl(
  locale: string,
  groupId: string,
  _previous: MeetingFormState,
  form: FormData,
): Promise<MeetingFormState> {
  const raw = form.get('meetingUrl');
  if (typeof raw !== 'string')
    return {
      error: localized(
        locale,
        'Enter a valid supported meeting link.',
        'أدخل رابط اجتماع صالحاً ومدعوماً.',
      ),
    };

  const meetingUrl = raw === '' ? null : parseMeetingUrl(raw, extraHosts());
  if (raw !== '' && !meetingUrl)
    return {
      error: localized(
        locale,
        'Enter a valid HTTPS link from a supported meeting provider.',
        'أدخل رابط HTTPS صالحاً من مزود اجتماعات مدعوم.',
      ),
    };

  const db = await createClient();
  const { error } = await db.rpc('save_group_meeting_url', {
    p_group_id: groupId,
    p_meeting_url: meetingUrl,
  });
  if (error)
    return {
      error: localized(
        locale,
        'Could not save the group meeting link. Refresh and try again.',
        'تعذر حفظ رابط اجتماع المجموعة. حدّث الصفحة وحاول مرة أخرى.',
      ),
    };

  for (const currentLocale of ['en', 'ar']) {
    revalidatePath(`/${currentLocale}/teacher/groups/${groupId}`);
    revalidatePath(`/${currentLocale}/student`);
    revalidatePath(`/${currentLocale}/student/classes/${groupId}`);
    revalidatePath(`/${currentLocale}/student/lessons/[id]`, 'page');
    revalidatePath(`/${currentLocale}/teacher/lessons/[id]`, 'page');
  }
  return { ok: true };
}
