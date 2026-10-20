import Link from 'next/link';

type GroupChoice = { id: string; name: string; status: string };

function groupStatus(status: string, ar: boolean) {
  if (ar)
    return (
      ({ draft: 'مسودة', published: 'منشورة', archived: 'مؤرشفة' } as Record<string, string>)[
        status
      ] ?? status
    );
  return status;
}

export function TeacherRosterFilterForm({
  locale,
  path,
  query,
  groupId,
  groups,
}: {
  locale: string;
  path: 'requests' | 'students';
  query: string;
  groupId: string | null;
  groups: GroupChoice[];
}) {
  const ar = locale === 'ar';
  return (
    <form
      action={`/${locale}/teacher/${path}`}
      method="get"
      className="mb-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-line bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end sm:p-4"
    >
      <label className="grid min-w-0 gap-1 text-sm font-bold text-teal">
        {ar ? 'اسم الطالب أو المجموعة' : 'Student or group name'}
        <input
          name="q"
          type="search"
          maxLength={120}
          defaultValue={query}
          className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line px-3 text-base font-normal text-ink"
        />
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-bold text-teal">
        {ar ? 'المجموعة' : 'Group'}
        <select
          name="group_id"
          defaultValue={groupId ?? ''}
          className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line bg-white px-3 text-base font-normal text-ink"
        >
          <option value="">{ar ? 'كل المجموعات' : 'All groups'}</option>
          {groups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name} · {groupStatus(group.status, ar)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:contents">
        <button
          className="min-h-11 w-full min-w-0 rounded-xl bg-teal px-3 font-bold text-white sm:w-auto sm:px-5"
          type="submit"
        >
          {ar ? 'بحث' : 'Search'}
        </button>
        <Link
          href={`/${locale}/teacher/${path}`}
          className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border-2 border-teal px-3 font-bold text-teal sm:w-auto sm:px-5"
        >
          {ar ? 'مسح' : 'Clear'}
        </Link>
      </div>
      <p className="min-w-0 break-words text-xs text-muted [overflow-wrap:anywhere] sm:col-span-full">
        {ar
          ? 'تعرض القائمة أحدث 50 مجموعة مطابقة والمجموعة المختارة إن لم تكن ضمنها. ابحث باسم المجموعة للوصول إلى المجموعات الأقدم.'
          : 'The selector shows the latest 50 matching groups plus your selected group. Search by group name to reach older groups.'}
      </p>
    </form>
  );
}
