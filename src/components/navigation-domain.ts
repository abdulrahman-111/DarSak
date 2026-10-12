export function isActivePath(pathname: string, href: string, exact = false): boolean {
  const route = href.split('?')[0].replace(/\/$/, '') || '/';
  return pathname === route || (!exact && route !== '/' && pathname.startsWith(`${route}/`));
}
