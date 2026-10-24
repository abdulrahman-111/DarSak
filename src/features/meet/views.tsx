import Link from 'next/link';
import { Panel } from '@/components/platform/ui';
import type { GoogleMeetStatus, LessonMeeting } from './data';
import {
  GoogleMeetConnectButton,
  GoogleMeetDisconnectForm,
  GoogleMeetSyncForm,
  TeacherMeetingControls,
} from './forms';

type Locale = 'en' | 'ar';

const statusText: Record<LessonMeeting['status'], Record<Locale, string>> = {
  unprepared: { en: 'Not prepared', ar: 'لم يتم التجهيز' },
  pending: { en: 'Preparing', ar: 'جارٍ التجهيز' },
  ready: { en: 'Ready', ar: 'جاهز' },
  failed: { en: 'Setup failed', ar: 'تعذر التجهيز' },
  reconnect_required: { en: 'Reconnect Google', ar: 'أعد ربط Google' },
  cancelled: { en: 'Cancelled', ar: 'ملغى' },
  disconnected: { en: 'Disconnected', ar: 'غير متصل' },
};

const errorText: Record<string, Record<Locale, string>> = {
  google_reconnect_required: {
    en: 'Reconnect Google to prepare this meeting.',
    ar: 'أعد ربط Google لتجهيز هذا الاجتماع.',
  },
  google_permission_denied: {
    en: 'Google did not grant the required Calendar permission.',
    ar: 'لم يمنح Google صلاحية التقويم المطلوبة.',
  },
  google_conference_failed: {
    en: 'Google could not create a Meet link. Retry or add a manual link.',
    ar: 'تعذر على Google إنشاء رابط Meet. أعد المحاولة أو أضف رابطًا يدويًا.',
  },
  google_rate_limited: {
    en: 'Google is temporarily limiting requests. Try again later.',
    ar: 'يقيّد Google الطلبات مؤقتًا. حاول مرة أخرى لاحقًا.',
  },
  google_unavailable: {
    en: 'Google is temporarily unavailable. Retry or add a manual link.',
    ar: 'خدمة Google غير متاحة مؤقتًا. أعد المحاولة أو أضف رابطًا يدويًا.',
  },
  meeting_queue_full: {
    en: 'The meeting queue is full. Try later or use a manual link.',
    ar: 'قائمة الاجتماعات ممتلئة. حاول لاحقًا أو استخدم رابطًا يدويًا.',
  },
  meeting_unsupported: {
    en: 'This Google account cannot create a Meet link for this event.',
    ar: 'لا يمكن لحساب Google هذا إنشاء رابط Meet لهذا الموعد.',
  },
  meeting_invalid_url: {
    en: 'The meeting link is invalid.',
    ar: 'رابط الاجتماع غير صالح.',
  },
};

/** Accepts credential-free HTTPS URLs only. The database still controls who receives the URL. */
export function safeMeetingUrl(value: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash)
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function StatusLine({ status, locale }: { status: LessonMeeting['status']; locale: Locale }) {
  return (
    <p
      className="mt-3 inline-flex rounded-full bg-cream px-3 py-1 text-sm font-bold text-teal"
      data-meeting-status={status}
    >
      {statusText[status][locale]}
    </p>
  );
}

function ErrorLine({ code, locale }: { code: string | null; locale: Locale }) {
  if (!code) return null;
  const message = errorText[code]?.[locale];
  if (!message) return null;
  return <p className="mt-3 text-sm text-muted">{message}</p>;
}

export function StudentMeetingCard({
  locale,
  meeting,
}: {
  locale: Locale;
  meeting: LessonMeeting;
}) {
  const ar = locale === 'ar';
  const url = meeting.status === 'ready' ? safeMeetingUrl(meeting.join_url) : null;
  return (
    <Panel className="mb-6">
      <h2 className="text-xl font-black text-teal">{ar ? 'اجتماع الحصة' : 'Lesson meeting'}</h2>
      <StatusLine status={meeting.status} locale={locale} />
      {url ? (
        <p className="mt-4">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-orange px-4 py-2.5 font-bold text-white"
          >
            {ar ? 'الانضمام إلى الاجتماع' : 'Join lesson meeting'}
          </a>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {meeting.status === 'cancelled'
            ? ar
              ? 'أُلغيت الحصة، لذلك لم يعد رابط الاجتماع متاحًا.'
              : 'This lesson was cancelled, so its meeting link is unavailable.'
            : ar
              ? 'سيظهر رابط الاجتماع هنا عندما يجهزه المعلم.'
              : 'The meeting link will appear here when your teacher prepares it.'}
        </p>
      )}
    </Panel>
  );
}

export function TeacherMeetingCard({
  locale,
  lessonId,
  meeting,
  enabled,
  oauthEnabled,
  canManage,
}: {
  locale: Locale;
  lessonId: string;
  meeting: LessonMeeting;
  enabled: boolean;
  oauthEnabled: boolean;
  canManage: boolean;
}) {
  if (!enabled) return null;
  const ar = locale === 'ar';
  const url = meeting.status === 'ready' ? safeMeetingUrl(meeting.join_url) : null;
  return (
    <Panel className="mb-6">
      <h2 className="text-xl font-black text-teal">{ar ? 'اجتماع الحصة' : 'Lesson meeting'}</h2>
      <StatusLine status={meeting.status} locale={locale} />
      <p className="mt-3 text-sm text-muted">
        {meeting.mode === 'manual'
          ? ar
            ? 'يُدار هذا الرابط يدويًا.'
            : 'This meeting link is managed manually.'
          : ar
            ? 'ينشئ DarSak رابط Meet منفصلًا لهذه الحصة.'
            : 'DarSak prepares a separate Meet link for this lesson.'}
      </p>
      {url && (
        <p className="mt-4">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-orange underline"
          >
            {ar ? 'فتح الاجتماع' : 'Open meeting'}
          </a>
        </p>
      )}
      <ErrorLine code={meeting.error_code} locale={locale} />
      {meeting.status === 'reconnect_required' && oauthEnabled && (
        <p className="mt-3 text-sm">
          <Link href={`/${locale}/account/integrations`} className="font-bold text-teal underline">
            {ar ? 'فتح التكاملات لإعادة الربط' : 'Open Integrations to reconnect'}
          </Link>
        </p>
      )}
      {canManage && meeting.status !== 'cancelled' && (
        <TeacherMeetingControls
          locale={locale}
          lessonId={lessonId}
          mode={meeting.mode}
          status={meeting.status}
          oauthEnabled={oauthEnabled}
        />
      )}
    </Panel>
  );
}

export function GoogleMeetAccountView({
  locale,
  enabled,
  oauthEnabled,
  status,
  resultCode,
}: {
  locale: Locale;
  enabled: boolean;
  oauthEnabled: boolean;
  status: GoogleMeetStatus | null;
  resultCode?: string;
}) {
  const ar = locale === 'ar';
  if (!enabled) {
    return (
      <Panel>
        <h2 className="text-xl font-black text-teal">Google Meet</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {ar
            ? 'Google Meet غير متاح في بيئة هذا الحساب حاليًا. لا تربط حساب Google؛ تواصل مع مسؤول التجربة لإعداد بيئة الاختبار.'
            : 'Google Meet is not available in this account environment yet. Do not connect Google; contact the pilot administrator to configure the staging environment.'}
        </p>
      </Panel>
    );
  }

  if (!status) {
    return (
      <Panel>
        <h2 className="text-xl font-black text-teal">Google Meet</h2>
        <p role="alert" className="mt-3 text-sm text-danger">
          {ar ? 'تعذر تحميل حالة الربط.' : 'Could not load the connection status.'}
        </p>
      </Panel>
    );
  }

  const resultMessages: Record<string, Record<Locale, string>> = {
    connected: { en: 'Google Calendar is connected.', ar: 'تم ربط تقويم Google.' },
    cancelled: { en: 'Google connection was cancelled.', ar: 'تم إلغاء ربط Google.' },
    permission_denied: {
      en: 'Google did not grant Calendar permission. Review the requested access and try again.',
      ar: 'لم يمنح Google صلاحية التقويم. راجع الصلاحيات المطلوبة وحاول مجددًا.',
    },
    reconnect_required: {
      en: 'Reconnect Google to continue preparing meetings.',
      ar: 'أعد ربط Google لمتابعة تجهيز الاجتماعات.',
    },
    invalid_flow: {
      en: 'The connection expired. Start again to continue.',
      ar: 'انتهت صلاحية عملية الربط. ابدأ من جديد للمتابعة.',
    },
    connection_failed: {
      en: 'Google could not be connected. Try again.',
      ar: 'تعذر ربط Google. حاول مرة أخرى.',
    },
    disabled: {
      en: 'Google Meet is not available in this environment.',
      ar: 'Google Meet غير متاح في هذه البيئة.',
    },
  };
  return (
    <div className="grid gap-6">
      <Panel>
        <h2 className="text-xl font-black text-teal">Google Meet</h2>
        {resultCode && resultMessages[resultCode] && (
          <p role="status" className="mt-3 text-sm text-teal">
            {resultMessages[resultCode][locale]}
          </p>
        )}
        <p className="mt-3 text-sm font-semibold text-teal">
          {status.state === 'connected'
            ? ar
              ? `متصل${status.email ? ` باسم ${status.email}` : ''}`
              : `Connected${status.email ? ` as ${status.email}` : ''}`
            : status.state === 'reconnect_required'
              ? ar
                ? 'يلزم إعادة ربط Google.'
                : 'Google needs to be reconnected.'
              : ar
                ? 'غير متصل'
                : 'Not connected'}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          {ar
            ? 'تدعم حسابات Google الشخصية المجانية ما يصل إلى 100 مشارك. وتُحدَّد الاجتماعات التي تضم 3 مشاركين أو أكثر بـ60 دقيقة. إنشاء رابط اجتماع هنا لا يغيّر خطة Google، وقد تختلف الميزات المتاحة حسب الحساب.'
            : 'Free personal Google accounts support up to 100 participants. Meetings with 3 or more participants are limited to 60 minutes. Creating a meeting link here does not upgrade your Google plan, and available features vary by account.'}
        </p>
        {!oauthEnabled && (
          <p className="mt-4 text-sm text-muted">
            {ar
              ? 'الربط التلقائي بـ Google غير مُعد بعد. يمكنك إضافة روابط HTTPS يدوية من صفحات الحصص.'
              : 'Automatic Google connection is not configured yet. You can add HTTPS meeting links manually from lesson pages.'}
          </p>
        )}
        {oauthEnabled && status.state === 'disconnected' ? (
          <div className="mt-4">
            <GoogleMeetConnectButton locale={locale} />
          </div>
        ) : oauthEnabled ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {status.state === 'reconnect_required' && (
              <GoogleMeetConnectButton locale={locale} reconnect />
            )}
            <GoogleMeetSyncForm locale={locale} />
            <GoogleMeetDisconnectForm locale={locale} />
          </div>
        ) : status.state !== 'disconnected' ? (
          <div className="mt-4">
            <GoogleMeetDisconnectForm locale={locale} />
          </div>
        ) : null}
      </Panel>
      <Panel>
        <h2 className="text-lg font-black text-teal">
          {ar ? 'حالة التجهيز' : 'Preparation status'}
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">{ar ? 'قيد الانتظار' : 'Pending'}</dt>
            <dd className="font-bold text-teal">{status.pending_count}</dd>
          </div>
          <div>
            <dt className="text-muted">{ar ? 'تحتاج إلى إعادة المحاولة' : 'Failed'}</dt>
            <dd className="font-bold text-teal">{status.failed_count}</dd>
          </div>
          <div>
            <dt className="text-muted">{ar ? 'غير مجهزة' : 'Not prepared'}</dt>
            <dd className="font-bold text-teal">{status.unprepared_count}</dd>
          </div>
        </dl>
        {oauthEnabled && (
          <p className="mt-4 text-sm leading-6 text-muted">
            {ar
              ? 'إذا كنت تستخدم شاشة موافقة Google للاختبار، تنتهي صلاحية رمز التحديث عادةً بعد 7 أيام. أعد الربط عند الحاجة، وتحقق من تاريخ انتهاء وضع الاختبار قبل كل تجربة.'
              : 'Google OAuth Testing mode refresh tokens usually expire after 7 days. Reconnect when needed, and check the test-mode expiry date before each pilot.'}
          </p>
        )}
      </Panel>
    </div>
  );
}
