'use client';

import { useActionState } from 'react';
import type { Locale } from '@/features/student/domain';
import {
  cancelTeacherGroup,
  deleteManualTeacherLesson,
  deleteUnusedTeacherGroup,
  type ManagementActionState,
} from './management-actions';

function Result({ state }: { state: ManagementActionState }) {
  return state?.error ? (
    <p role="alert" className="w-full text-sm text-red-700">
      {state.error}
    </p>
  ) : state?.success ? (
    <p role="status" className="w-full text-sm text-teal">
      {state.success}
    </p>
  ) : null;
}

export function CancelTeacherGroupForm({ locale, groupId }: { locale: Locale; groupId: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    cancelTeacherGroup.bind(null, locale, groupId),
    null,
  );
  const confirm = (event: React.FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        ar
          ? 'أرشفة هذه المجموعة؟ سيتوقف استقبال الطلبات الجديدة، وستُرفض الطلبات المعلقة وتُلغى الحصص القادمة. ستبقى العضويات المقبولة وسجل الحصص والمواد.'
          : 'Archive this group? New requests will stop, pending requests will be rejected, and future lessons will be cancelled. Accepted memberships, lesson history, and materials will remain.',
      )
    )
      event.preventDefault();
  };
  return (
    <form action={action} onSubmit={confirm} className="grid justify-items-start gap-2">
      <button
        disabled={pending}
        className="rounded-xl border border-orange/40 px-4 py-2.5 text-sm font-bold text-orange disabled:opacity-50"
      >
        {pending ? '…' : ar ? 'إلغاء / أرشفة المجموعة' : 'Cancel / archive group'}
      </button>
      <Result state={state} />
    </form>
  );
}

export function DeleteUnusedTeacherGroupForm({
  locale,
  groupId,
}: {
  locale: Locale;
  groupId: string;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    deleteUnusedTeacherGroup.bind(null, locale, groupId),
    null,
  );
  const confirm = (event: React.FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        ar
          ? 'حذف هذه المجموعة نهائيًا؟ يجب ألا يكون لها طلبات أو عضويات أو حصص؛ سيُحذف جدولها الأسبوعي معها.'
          : 'Permanently delete this unused group? It must have no requests, memberships, or lessons. Its weekly schedule will be removed too.',
      )
    )
      event.preventDefault();
  };
  return (
    <form action={action} onSubmit={confirm} className="grid justify-items-start gap-2">
      <button
        disabled={pending}
        className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"
      >
        {pending ? '…' : ar ? 'حذف مجموعة غير مستخدمة' : 'Delete unused group'}
      </button>
      <Result state={state} />
    </form>
  );
}

export function DeleteManualTeacherLessonForm({
  locale,
  lessonId,
  groupId,
}: {
  locale: Locale;
  lessonId: string;
  groupId: string;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    deleteManualTeacherLesson.bind(null, locale, lessonId, groupId),
    null,
  );
  const confirm = (event: React.FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        ar
          ? 'حذف هذه الحصة اليدوية القادمة نهائيًا؟ لا يمكن حذف الحصص المنشأة من الجدول أو المكتملة أو التي تحتوي مواد أو ملفات.'
          : 'Permanently delete this future manual lesson? Generated or completed lessons and lessons with materials or files cannot be deleted.',
      )
    )
      event.preventDefault();
  };
  return (
    <form action={action} onSubmit={confirm} className="grid justify-items-start gap-2">
      <button
        disabled={pending}
        className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"
      >
        {pending ? '…' : ar ? 'حذف الحصة اليدوية' : 'Delete manual lesson'}
      </button>
      <Result state={state} />
    </form>
  );
}

export function GroupManagementControls({
  locale,
  groupId,
  status,
}: {
  locale: Locale;
  groupId: string;
  status: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {status !== 'archived' && <CancelTeacherGroupForm locale={locale} groupId={groupId} />}
      {(status === 'draft' || status === 'archived') && (
        <DeleteUnusedTeacherGroupForm locale={locale} groupId={groupId} />
      )}
    </div>
  );
}
