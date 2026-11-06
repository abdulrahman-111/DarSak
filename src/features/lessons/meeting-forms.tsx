'use client';

import { useActionState } from 'react';
import { saveGroupMeetingUrl, type MeetingFormState } from './meeting-actions';

const control = 'mt-1 w-full min-w-0 rounded-xl border border-line bg-cream px-3 py-2.5';

export function GroupMeetingForm({
  locale,
  groupId,
  meetingUrl,
}: {
  locale: string;
  groupId: string;
  meetingUrl: string | null;
}) {
  const [state, action, pending] = useActionState(
    saveGroupMeetingUrl.bind(null, locale, groupId),
    null as MeetingFormState,
  );
  const ar = locale === 'ar';
  return (
    <form action={action} className="grid min-w-0 gap-3">
      <label className="text-sm font-bold">
        {ar ? 'رابط الاجتماع الافتراضي' : 'Default meeting link'}
        <input
          name="meetingUrl"
          type="url"
          maxLength={500}
          defaultValue={meetingUrl ?? ''}
          autoComplete="url"
          dir="ltr"
          className={control}
        />
      </label>
      <p className="text-xs text-muted">
        {ar
          ? 'Google Meet أو Zoom أو Teams أو Jitsi أو Whereby. روابط HTTPS فقط وبحد أقصى ٥٠٠ حرف. اتركه فارغاً لإزالة الرابط الافتراضي.'
          : 'Google Meet, Zoom, Teams, Jitsi or Whereby. HTTPS links only; up to 500 characters. Leave empty to clear the default.'}
      </p>
      {state?.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : state?.ok ? (
        <p role="status" className="text-sm text-teal">
          {ar ? 'تم حفظ رابط الاجتماع.' : 'Meeting link saved.'}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="min-h-11 justify-self-start rounded-xl bg-orange px-4 py-2.5 font-bold text-white hover:bg-orange-deep"
      >
        {pending ? '…' : ar ? 'حفظ الرابط' : 'Save link'}
      </button>
    </form>
  );
}
