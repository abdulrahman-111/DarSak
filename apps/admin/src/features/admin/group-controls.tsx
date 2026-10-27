'use client';

import { useActionState } from 'react';
import { archiveAdminGroup, deleteUnusedAdminGroup, type GroupActionState } from './group-actions';

function Result({ state }: { state: GroupActionState }) {
  if (state?.error)
    return (
      <p role="alert" className="w-full text-sm text-danger">
        {state.error}
      </p>
    );
  if (state?.success)
    return (
      <p role="status" className="w-full text-sm text-teal">
        {state.success}
      </p>
    );
  return null;
}

export function GroupManagementControls({
  locale,
  groupId,
  status,
}: {
  locale: 'en' | 'ar';
  groupId: string;
  status: string;
}) {
  const ar = locale === 'ar';
  const [archiveState, archive, archivePending] = useActionState(
    archiveAdminGroup.bind(null, locale, groupId),
    null,
  );
  const [deleteState, remove, deletePending] = useActionState(
    deleteUnusedAdminGroup.bind(null, locale, groupId),
    null,
  );
  const confirmArchive = (event: React.FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        ar
          ? 'أرشفة هذه المجموعة؟ ستُرفض الطلبات المعلقة وتُلغى الحصص القادمة مع الاحتفاظ بالسجل.'
          : 'Archive this group? Pending requests will be rejected and future lessons cancelled while history is kept.',
      )
    )
      event.preventDefault();
  };
  const confirmDelete = (event: React.FormEvent<HTMLFormElement>) => {
    if (
      !window.confirm(
        ar
          ? 'حذف هذه المجموعة نهائيًا؟ يجب ألا يكون لها طلبات أو عضويات أو حصص.'
          : 'Permanently delete this unused group? It must have no requests, memberships, or lessons.',
      )
    )
      event.preventDefault();
  };
  return (
    <div className="flex flex-wrap gap-3">
      {status !== 'archived' && (
        <form action={archive} onSubmit={confirmArchive} className="grid justify-items-start gap-2">
          <button
            disabled={archivePending}
            className="rounded-xl border border-orange/40 px-4 py-2.5 text-sm font-bold text-orange disabled:opacity-50"
          >
            {archivePending ? '…' : ar ? 'إلغاء / أرشفة المجموعة' : 'Cancel / archive group'}
          </button>
          <Result state={archiveState} />
        </form>
      )}
      {(status === 'draft' || status === 'archived') && (
        <form action={remove} onSubmit={confirmDelete} className="grid justify-items-start gap-2">
          <button
            disabled={deletePending}
            className="rounded-xl border border-danger/30 px-4 py-2.5 text-sm font-bold text-danger disabled:opacity-50"
          >
            {deletePending ? '…' : ar ? 'حذف مجموعة غير مستخدمة' : 'Delete unused group'}
          </button>
          <Result state={deleteState} />
        </form>
      )}
    </div>
  );
}
