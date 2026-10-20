export type MobileWorkspaceRole = 'student' | 'teacher' | 'admin';
export type MobileWorkspaceLink = { href: string; label: string };
export type MobilePrimaryLink = MobileWorkspaceLink & {
  key: string;
  icon: 'home' | 'groups' | 'calendar' | 'requests' | 'explore' | 'teachers' | 'reports' | 'people';
};

const labels = {
  en: {
    home: 'Home',
    classes: 'Classes',
    timetable: 'Timetable',
    explore: 'Explore',
    more: 'More',
    groups: 'Groups',
    calendar: 'Calendar',
    requests: 'Requests',
    teachers: 'Teachers',
    reports: 'Reports',
    people: 'People',
  },
  ar: {
    home: 'الرئيسية',
    classes: 'مجموعاتي',
    timetable: 'الجدول',
    explore: 'اكتشف',
    more: 'المزيد',
    groups: 'المجموعات',
    calendar: 'الحصص',
    requests: 'الطلبات',
    teachers: 'المعلمون',
    reports: 'البلاغات',
    people: 'الأشخاص',
  },
};

export function mobileWorkspaceNavigation(
  locale: string,
  role: MobileWorkspaceRole,
  items: MobileWorkspaceLink[],
) {
  const copy = labels[locale === 'ar' ? 'ar' : 'en'];
  const links = new Map(items.map(item => [item.href, item]));
  const specs: Array<[string, string, MobilePrimaryLink['icon'], string]> =
    role === 'student'
      ? [
          [`/${locale}/student`, 'home', 'home', copy.home],
          [`/${locale}/student/classes`, 'classes', 'groups', copy.classes],
          [`/${locale}/timetable`, 'timetable', 'calendar', copy.timetable],
          [`/${locale}/teachers`, 'teachers', 'explore', copy.explore],
        ]
      : role === 'teacher'
        ? [
            [`/${locale}/teacher`, 'teacher', 'home', copy.home],
            [`/${locale}/teacher/groups`, 'groups', 'groups', copy.groups],
            [`/${locale}/teacher/lessons`, 'lessons', 'calendar', copy.calendar],
            [`/${locale}/teacher/requests`, 'requests', 'requests', copy.requests],
          ]
        : [
            [`/${locale}/admin`, 'admin', 'home', copy.home],
            [`/${locale}/admin/teachers`, 'teachers', 'teachers', copy.teachers],
            [`/${locale}/admin/reports`, 'reports', 'reports', copy.reports],
            [`/${locale}/admin/users`, 'users', 'people', copy.people],
          ];
  const primary = specs.flatMap(([href, key, icon, label]) => {
    const item = links.get(href);
    return item ? [{ ...item, key, icon, label } as MobilePrimaryLink] : [];
  });
  const primaryHrefs = new Set(primary.map(item => item.href));
  return {
    primary,
    secondary: items.filter(item => !primaryHrefs.has(item.href)),
    moreLabel: copy.more,
  };
}
