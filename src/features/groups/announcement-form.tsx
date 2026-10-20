'use client';

import { useActionState, useState } from 'react';
import { saveGroupAnnouncement } from './announcement-actions';
import { GROUP_ANNOUNCEMENT_MAX_LENGTH, announcementLength } from './announcement-domain';
import type { Locale } from '@/features/student/domain';
import type { GroupAnnouncement } from './announcement-data';

function AnnouncementFields({
  locale,
  groupId,
  body,
  readOnly,
  pending,
}: {
  locale: Locale;
  groupId: string;
  body: string;
  readOnly: boolean;
  pending: boolean;
}) {
  const ar = locale === 'ar';
  const [text, setText] = useState(body);
  const count = announcementLength(text);
  return (
    <>
      <label htmlFor={`announcement-${groupId}`} className="text-sm font-bold text-ink">
        {ar ? 'الإعلان المثبت' : 'Pinned announcement'}
      </label>
      <textarea
        id={`announcement-${groupId}`}
        name="body"
        value={text}
        readOnly={readOnly || pending}
        onChange={event => setText(event.currentTarget.value)}
        rows={5}
        className="min-h-32 w-full rounded-xl border border-line bg-white p-3 text-sm leading-6 text-ink focus:outline-none focus:ring-2 focus:ring-teal"
        aria-describedby={`announcement-count-${groupId}`}
      />
      <div
        id={`announcement-count-${groupId}`}
        className="flex flex-wrap justify-between gap-2 text-xs text-muted"
      >
        <span>
          {ar ? 'اكتب نصاً فقط؛ يُعرض كما هو دون تنسيق.' : 'Plain text only; displayed as written.'}
        </span>
        <span dir="ltr">
          {count}/{GROUP_ANNOUNCEMENT_MAX_LENGTH}
        </span>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending || count > GROUP_ANNOUNCEMENT_MAX_LENGTH}
            className="min-h-11 rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'حفظ الإعلان' : 'Save announcement'}
          </button>
          <button
            type="submit"
            name="clear"
            value="true"
            disabled={pending || (!body && !count)}
            className="min-h-11 rounded-xl border border-line px-5 py-3 font-bold text-ink disabled:opacity-50"
          >
            {ar ? 'مسح الإعلان' : 'Clear announcement'}
          </button>
        </div>
      )}
    </>
  );
}

export function AnnouncementForm({
  locale,
  groupId,
  announcement,
  readOnly = false,
}: {
  locale: Locale;
  groupId: string;
  announcement: GroupAnnouncement | null;
  readOnly?: boolean;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    saveGroupAnnouncement.bind(null, locale, groupId),
    null,
  );
  const body = state?.revision ? (state.body ?? '') : (announcement?.body ?? '');
  const editorKey = state?.revision ?? announcement?.edited_at ?? 'empty';
  return (
    <form action={action} dir={ar ? 'rtl' : 'ltr'} className="mt-4 grid gap-3">
      <AnnouncementFields
        key={editorKey}
        locale={locale}
        groupId={groupId}
        body={body}
        readOnly={readOnly}
        pending={pending}
      />
      {announcement && (
        <p className="text-xs text-muted">
          {ar
            ? 'يمكن للأعضاء المقبولين مراجعة الإعلان في سجل المجموعة.'
            : 'Accepted members can review this announcement in group history.'}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm font-semibold text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}
