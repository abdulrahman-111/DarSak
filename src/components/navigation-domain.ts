export function isActivePath(pathname: string, href: string, exact = false): boolean {
  const route = href.split('?')[0].replace(/\/$/, '') || '/';
  return pathname === route || (!exact && route !== '/' && pathname.startsWith(`${route}/`));
}

export function hasStudentWorkspaceNavigation(pathname:string,locale:string):boolean{
 const path=pathname.replace(/\/$/,'');
 return [`/${locale}/student`,`/${locale}/timetable`,`/${locale}/notifications`,`/${locale}/reports`,`/${locale}/account`,`/${locale}/teachers`,`/${locale}/groups`].some(base=>path===base||path.startsWith(`${base}/`));
}

export function hasTeacherWorkspaceNavigation(pathname:string,locale:string):boolean{
 const path=pathname.replace(/\/$/,'');
 return [`/${locale}/teacher`,`/${locale}/notifications`,`/${locale}/reports`,`/${locale}/account`,`/${locale}/teachers`,`/${locale}/groups`].some(base=>path===base||path.startsWith(`${base}/`));
}

export function hasAdminWorkspaceNavigation(pathname:string,locale:string):boolean{
 const path=pathname.replace(/\/$/,'');
 return [`/${locale}/admin`,`/${locale}/notifications`,`/${locale}/reports`,`/${locale}/account`,`/${locale}/teachers`,`/${locale}/groups`].some(base=>path===base||path.startsWith(`${base}/`));
}
