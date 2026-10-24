'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/features/student/domain';
import {
  disconnectGoogleMeet,
  manageLessonMeeting,
  syncGoogleMeet,
  type MeetingOperation,
} from './actions';

const control = 'mt-1 block w-full rounded-xl border border-line bg-cream p-3';

type FormResult = { error?: string; success?: string } | null;

const errorText: Record<string, Record<string, string>> = {
  meeting_queue_full: {
    en: 'The meeting queue is full. Try again later or add a manual meeting link.',
    ar: 'قائمة تجهيز الاجتماعات ممتلئة. حاول لاحقاً أو أضف رابط اجتماع يدويًا.',
  },
  meeting_invalid_url: {
    en: 'Enter a valid HTTPS meeting link.',
    ar: 'أدخل رابط اجتماع صحيحًا يبدأ بـ HTTPS.',
  },
  google_reconnect_required: {
    en: 'Reconnect your Google account before retrying.',
    ar: 'أعد ربط حساب Google قبل إعادة المحاولة.',
  },
  disabled: {
    en: 'Google Meet is not available in this environment.',
    ar: 'Google Meet غير متاح في هذه البيئة.',
  },
  default: {
    en: 'Could not update the meeting. Refresh and try again.',
    ar: 'تعذر تحديث الاجتماع. حدّث الصفحة وحاول مرة أخرى.',
  },
};

function errorMessage(code: string | undefined, locale: Locale): string | null {
  if (!code) return null;
  return (errorText[code] ?? errorText.default)[locale];
}

export function GoogleMeetConnectButton({
  locale,
  reconnect = false,
}: {
  locale: Locale;
  reconnect?: boolean;
}) {
  const ar = locale === 'ar';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/google/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const result: unknown = await response.json();
      const authorizationUrl =
        result && typeof result === 'object' && 'authorizationUrl' in result
          ? result.authorizationUrl
          : null;
      if (!response.ok || typeof authorizationUrl !== 'string') throw new Error('connect_failed');
      const target = new URL(authorizationUrl);
      if (
        target.protocol !== 'https:' ||
        target.hostname !== 'accounts.google.com' ||
        target.pathname !== '/o/oauth2/v2/auth' ||
        target.username ||
        target.password
      ) {
        throw new Error('connect_failed');
      }
      window.location.assign(target.toString());
    } catch {
      setPending(false);
      setError(
        ar
          ? 'تعذر بدء الربط. حدّث الصفحة وحاول مرة أخرى.'
          : 'Could not start account connection. Refresh and try again.',
      );
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <button
        type="button"
        onClick={connect}
        disabled={pending}
        aria-busy={pending}
        className="min-h-11 rounded-xl bg-orange px-4 py-2.5 font-bold text-white disabled:opacity-50"
      >
        {pending
          ? ar
            ? 'جارٍ الاتصال…'
            : 'Connecting…'
          : reconnect
            ? ar
              ? 'إعادة ربط Google'
              : 'Reconnect Google'
            : ar
              ? 'ربط Google'
              : 'Connect Google'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function GoogleMeetSyncForm({ locale }: { locale: Locale }) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_previous: FormResult, _form: FormData): Promise<FormResult> => {
      const result = await syncGoogleMeet();
      if (result.error) return { error: result.error };
      router.refresh();
      return { success: ar ? 'تمت مزامنة الاجتماعات المعلقة.' : 'Pending meetings synced.' };
    },
    null,
  );
  return (
    <form action={action} className="grid justify-items-start gap-2">
      <button
        disabled={pending}
        className="min-h-11 rounded-xl border border-line px-4 py-2.5 font-bold text-teal disabled:opacity-50"
      >
        {pending ? '…' : ar ? 'مزامنة الاجتماعات' : 'Sync meetings'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(state.error, locale)}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}

export function GoogleMeetDisconnectForm({ locale }: { locale: Locale }) {
  const ar = locale === 'ar';
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_previous: FormResult, _form: FormData): Promise<FormResult> => {
      const result = await disconnectGoogleMeet();
      if (result.error) return { error: result.error };
      router.refresh();
      return { success: ar ? 'تم فصل حساب Google.' : 'Google account disconnected.' };
    },
    null,
  );
  return (
    <form
      action={action}
      onSubmit={event => {
        if (!window.confirm(ar ? 'فصل حساب Google؟' : 'Disconnect Google?')) event.preventDefault();
      }}
      className="grid justify-items-start gap-2"
    >
      <button
        disabled={pending}
        className="min-h-11 rounded-xl border border-danger/30 px-4 py-2.5 font-bold text-danger disabled:opacity-50"
      >
        {pending ? '…' : ar ? 'فصل Google' : 'Disconnect Google'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(state.error, locale)}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}

export function TeacherMeetingControls({
  locale,
  lessonId,
  mode,
  status,
  oauthEnabled,
}: {
  locale: Locale;
  lessonId: string;
  mode: 'automatic' | 'manual';
  status: string;
  oauthEnabled: boolean;
}) {
  const ar = locale === 'ar';
  const router = useRouter();
  const primaryOperation: MeetingOperation | null = oauthEnabled
    ? status === 'unprepared'
      ? 'prepare'
      : status === 'failed'
        ? 'retry'
        : null
    : null;
  const [state, action, pending] = useActionState(
    async (_previous: FormResult, form: FormData): Promise<FormResult> => {
      const operation = String(form.get('operation')) as MeetingOperation;
      const manualUrl = String(form.get('manual_url') ?? '');
      const result = await manageLessonMeeting(locale, lessonId, operation, manualUrl);
      if (result.error) return { error: result.error };
      router.refresh();
      return { success: ar ? 'تم تحديث إعداد الاجتماع.' : 'Meeting settings updated.' };
    },
    null,
  );

  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4">
      {primaryOperation && (
        <form action={action}>
          <input type="hidden" name="operation" value={primaryOperation} />
          <button
            disabled={pending}
            className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-teal disabled:opacity-50"
          >
            {pending
              ? '…'
              : primaryOperation === 'prepare'
                ? ar
                  ? 'تجهيز رابط الاجتماع'
                  : 'Prepare meeting link'
                : ar
                  ? 'إعادة المحاولة'
                  : 'Retry meeting setup'}
          </button>
        </form>
      )}
      {status === 'pending' && (
        <p className="text-sm text-muted">
          {ar
            ? 'يتم تجهيز الرابط. يمكنك مزامنة الاجتماعات من التكاملات.'
            : 'The link is being prepared. Sync meetings from Integrations if it remains pending.'}
        </p>
      )}
      <form action={action} className="grid justify-items-start gap-2">
        <input type="hidden" name="operation" value="manual" />
        <label className="w-full text-sm font-bold">
          {ar ? 'رابط اجتماع يدوي (HTTPS)' : 'Manual meeting link (HTTPS)'}
          <input
            name="manual_url"
            type="url"
            required
            inputMode="url"
            placeholder="https://meet.google.com/..."
            className={control}
          />
        </label>
        <button
          disabled={pending}
          className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-teal disabled:opacity-50"
        >
          {pending ? '…' : ar ? 'حفظ الرابط اليدوي' : 'Save manual link'}
        </button>
      </form>
      {mode === 'manual' && (
        <form action={action}>
          <input type="hidden" name="operation" value="clear_manual" />
          <button
            disabled={pending}
            className="min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-muted disabled:opacity-50"
          >
            {pending ? '…' : ar ? 'مسح الرابط اليدوي' : 'Clear manual link'}
          </button>
        </form>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(state.error, locale)}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-teal">
          {state.success}
        </p>
      )}
    </div>
  );
}
