export function isActivePath(pathname: string, href: string, exact = false): boolean {
  const route = href.split('?')[0].replace(/\/$/, '') || '/';
  return pathname === route || (!exact && route !== '/' && pathname.startsWith(`${route}/`));
}

export function isWorkspaceItemActive(
  pathname: string,
  item: { href: string; activePaths?: string[] },
  exact = false,
): boolean {
  return (
    isActivePath(pathname, item.href, exact) ||
    (item.activePaths ?? []).some(path => isActivePath(pathname, path))
  );
}

export function hasStudentWorkspaceNavigation(pathname: string, locale: string): boolean {
  const path = pathname.replace(/\/$/, '');
  return [
    `/${locale}/student`,
    `/${locale}/timetable`,
    `/${locale}/notifications`,
    `/${locale}/reports`,
    `/${locale}/account`,
    `/${locale}/teachers`,
    `/${locale}/groups`,
  ].some(base => path === base || path.startsWith(`${base}/`));
}

export function hasTeacherWorkspaceNavigation(pathname: string, locale: string): boolean {
  const path = pathname.replace(/\/$/, '');
  return [
    `/${locale}/teacher`,
    `/${locale}/notifications`,
    `/${locale}/reports`,
    `/${locale}/account`,
    `/${locale}/teachers`,
    `/${locale}/groups`,
  ].some(base => path === base || path.startsWith(`${base}/`));
}
