import Link from 'next/link';

type GroupChoice = { id: string; name: string; status: string };

function groupStatus(status: string, ar: boolean) {
  if (ar) return ({ draft: 'مسودة', published: 'منشورة', archived: 'مؤرشفة' } as Record<string, string>)[status] ?? status;
  return status;
}

export function TeacherRosterFilterForm({ locale, path, query, groupId, groups }: { locale: string; path: 'requests' | 'students'; query: string; groupId: string | null; groups: GroupChoice[] }) {
  const ar = locale === 'ar';
  return <form action={`/${locale}/teacher/${path}`} method="get" className="mb-5 grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
    <label className="grid gap-1 text-sm font-bold text-teal">
      {ar ? 'اسم الطالب أو المجموعة' : 'Student or group name'}
      <input name="q" type="search" maxLength={120} defaultValue={query} className="min-h-11 rounded-xl border border-line px-3 text-base font-normal text-ink" />
    </label>
    <label className="grid gap-1 text-sm font-bold text-teal">
      {ar ? 'المجموعة' : 'Group'}
      <select name="group_id" defaultValue={groupId ?? ''} className="min-h-11 rounded-xl border border-line bg-white px-3 text-base font-normal text-ink">
        <option value="">{ar ? 'كل المجموعات' : 'All groups'}</option>
        {groups.map(group => <option key={group.id} value={group.id}>{group.name} · {groupStatus(group.status, ar)}</option>)}
      </select>
    </label>
    <button className="min-h-11 rounded-xl bg-teal px-5 font-bold text-white" type="submit">{ar ? 'بحث' : 'Search'}</button>
    <Link href={`/${locale}/teacher/${path}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-teal px-5 font-bold text-teal">{ar ? 'مسح' : 'Clear'}</Link>
    <p className="text-xs text-muted sm:col-span-full">{ar ? 'تعرض القائمة أحدث 50 مجموعة مطابقة والمجموعة المختارة إن لم تكن ضمنها. ابحث باسم المجموعة للوصول إلى المجموعات الأقدم.' : 'The selector shows the latest 50 matching groups plus your selected group. Search by group name to reach older groups.'}</p>
  </form>;
}
