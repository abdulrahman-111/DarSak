import Link from 'next/link';
import type { Locale } from '@/features/student/domain';
import { Status } from '@/components/platform/ui';
import { GroupManagementControls } from './management-forms';

export type TeacherGroupListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  capacity: number;
  location: string | null;
  subject: string | null;
};

function groupHref(locale: Locale, group: TeacherGroupListItem) {
  return group.status === 'draft'
    ? `/${locale}/teacher/groups/${group.id}/setup?step=details`
    : `/${locale}/teacher/groups/${group.id}`;
}

function groupAction(locale: Locale, status: string) {
  const ar = locale === 'ar';
  return status === 'draft'
    ? ar
      ? 'استئناف الإعداد ←'
      : 'Resume setup →'
    : status === 'archived'
      ? ar
        ? 'عرض السجل ←'
        : 'View history →'
      : ar
        ? 'إدارة المجموعة ←'
        : 'Manage group →';
}

export function TeacherGroupsResponsiveList({
  groups,
  locale,
}: {
  groups: TeacherGroupListItem[];
  locale: Locale;
}) {
  const ar = locale === 'ar';
  const labels = ar
    ? {
        caption: 'مجموعاتي',
        group: 'المجموعة',
        subject: 'المادة',
        capacity: 'السعة',
        status: 'الحالة',
        actions: 'الإجراءات',
      }
    : {
        caption: 'My groups',
        group: 'Group',
        subject: 'Subject',
        capacity: 'Capacity',
        status: 'Status',
        actions: 'Actions',
      };

  return (
    <>
      <div className="hidden min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-xs lg:block">
        <table className="w-full table-fixed text-start">
          <caption className="sr-only">{labels.caption}</caption>
          <thead className="bg-cream text-sm text-muted">
            <tr>
              <th scope="col" className="w-[34%] px-4 py-3 font-bold">
                {labels.group}
              </th>
              <th scope="col" className="w-[18%] px-4 py-3 font-bold">
                {labels.subject}
              </th>
              <th scope="col" className="w-[12%] px-4 py-3 font-bold">
                {labels.capacity}
              </th>
              <th scope="col" className="w-[12%] px-4 py-3 font-bold">
                {labels.status}
              </th>
              <th scope="col" className="w-[24%] px-4 py-3 font-bold">
                {labels.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <tr key={group.id} className="border-t border-line align-top">
                <th
                  scope="row"
                  className="break-words px-4 py-4 text-start font-normal [overflow-wrap:anywhere]"
                >
                  <Link
                    href={groupHref(locale, group)}
                    className="font-bold text-teal underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
                  >
                    {group.name}
                  </Link>
                  {group.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{group.description}</p>
                  )}
                  {group.location && <p className="mt-1 text-sm text-muted">{group.location}</p>}
                </th>
                <td className="break-words px-4 py-4 text-sm [overflow-wrap:anywhere]">
                  {group.subject || '—'}
                </td>
                <td className="px-4 py-4 text-sm">{group.capacity}</td>
                <td className="px-4 py-4">
                  <Status value={group.status} locale={locale} />
                </td>
                <td className="px-4 py-4">
                  <Link
                    href={groupHref(locale, group)}
                    className="font-bold text-teal underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
                  >
                    {groupAction(locale, group.status)}
                  </Link>
                  <div className="mt-3 border-t border-line pt-3">
                    <GroupManagementControls
                      locale={locale}
                      groupId={group.id}
                      status={group.status}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid min-w-0 gap-4 lg:hidden">
        {groups.map(group => (
          <article
            key={group.id}
            className="student-card min-w-0 rounded-2xl border border-line bg-white p-5 shadow-xs"
          >
            <Link
              href={groupHref(locale, group)}
              className="block min-w-0 rounded-xl hover:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
            >
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  {group.subject && (
                    <p className="text-sm font-bold text-orange">{group.subject}</p>
                  )}
                  <h2 className="mt-1 wrap-break-word text-xl font-bold text-teal [overflow-wrap:anywhere]">
                    {group.name}
                  </h2>
                </div>
                <Status value={group.status} locale={locale} />
              </div>
              {group.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted">{group.description}</p>
              )}
              <p className="mt-4 text-sm text-muted">
                {group.location ? `${group.location} · ` : ''}
                {ar ? 'السعة' : 'Capacity'} {group.capacity}
              </p>
              <p className="mt-4 text-sm font-bold text-teal">
                {groupAction(locale, group.status)}
              </p>
            </Link>
            <div className="mt-4 border-t border-line pt-4">
              <GroupManagementControls locale={locale} groupId={group.id} status={group.status} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
